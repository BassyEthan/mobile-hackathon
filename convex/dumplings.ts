import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import { markToday } from "./schedule";
import type { Id } from "./_generated/dataModel";
import { canSeeDumpling, dateInZone, fillingHiddenFrom, foldedOn, requireMember, sessionArgs, sparksFor, tableMembers } from "./lib";
import { notify } from "./notify";

const MAX_BYTES = 80 * 1024 * 1024;

export const generateUploadUrl = mutation({
  args: sessionArgs,
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireMember(ctx, args);
    return await ctx.storage.generateUploadUrl();
  },
});

export const fold = mutation({
  args: {
    ...sessionArgs,
    storageId: v.id("_storage"),
    mediaType: v.union(v.literal("video"), v.literal("audio"), v.literal("photo")),
    fillingId: v.optional(v.id("fillings")),
    sparkKey: v.optional(v.string()),
    replyTo: v.optional(v.id("dumplings")),
    askId: v.optional(v.id("askQueue")),
  },
  returns: v.id("dumplings"),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const now = Date.now();
    const date = dateInZone(now, table.timeZone);
    let spark: { fillingId: Id<"fillings">; sparkKey: string; sparkText: string; sealed?: true; hiddenFrom?: Id<"members">[] } | null = null;
    if (args.fillingId) {
      if (args.replyTo) throw new ConvexError("Fold back or answer the spark, one at a time.");
      const filling = await ctx.db.get("fillings", args.fillingId);
      if (!filling || filling.tableId !== table._id || fillingHiddenFrom(filling, member._id)) throw new ConvexError("That spark is not open to you.");
      if (filling.date !== date) throw new ConvexError("That spark has passed. Fold anything instead.");
      const chosen = sparksFor(filling, "en").find((s) => s.key === (args.sparkKey ?? "primary"));
      if (!chosen) throw new ConvexError("Pick one of today's sparks.");
      spark = {
        fillingId: filling._id,
        sparkKey: chosen.key,
        sparkText: chosen.english,
        ...(chosen.type === "sealed" ? { sealed: true as const } : {}),
        ...(filling.hiddenFrom?.length ? { hiddenFrom: filling.hiddenFrom } : {}),
      };
    } else if (args.sparkKey !== undefined) {
      throw new ConvexError("Pick one of today's sparks.");
    }
    const ask = args.askId ? await ctx.db.get("askQueue", args.askId) : null;
    if (args.askId) {
      if (args.fillingId || args.replyTo) throw new ConvexError("Answer the question, or the spark, one at a time.");
      if (!ask || ask.tableId !== table._id || (ask.addressedTo && ask.addressedTo !== member._id)) throw new ConvexError("That question is not for you.");
      if (ask.answeredBy) throw new ConvexError("You already answered that question.");
    }
    const parent = args.replyTo ? await ctx.db.get("dumplings", args.replyTo) : null;
    if (args.replyTo && (!parent || !(await canSeeDumpling(ctx, member, parent)))) throw new ConvexError("That clip is not open to you.");
    const firstToday = !(await foldedOn(ctx, member._id, date));
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file) throw new ConvexError("The upload did not arrive. Try again.");
    if (file.size > MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("That clip is too large.");
    }
    if (args.mediaType === "photo" && !file.contentType?.startsWith("image/")) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("That photo did not upload properly. Try again.");
    }
    await markToday(ctx, table, now);
    const dumplingId = await ctx.db.insert("dumplings", {
      tableId: table._id,
      memberId: member._id,
      date,
      answeredSpark: spark !== null,
      ...(spark ?? {}),
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      ...(ask ? { askId: ask._id, sparkText: ask.text } : {}),
      mediaStorageId: args.storageId,
      mediaType: args.mediaType,
      createdAt: now,
    });
    if (ask) await ctx.db.patch("askQueue", ask._id, { answeredBy: dumplingId });
    await ctx.scheduler.runAfter(0, internal.ai.processDumpling, { dumplingId });
    if (args.mediaType !== "photo") await ctx.scheduler.runAfter(0, internal.ai.findHighlight, { dumplingId });
    const url = `/clip/${dumplingId}?date=${date}`;
    if (parent && parent.memberId !== member._id) {
      await notify(ctx, {
        memberIds: [parent.memberId],
        kind: `foldback:${member._id}`,
        title: `${member.displayName} folded back to you`,
        body: "Tap to watch their reply.",
        url,
      });
    } else if (!parent && firstToday && !spark?.sealed) {
      const others = (await tableMembers(ctx, table._id)).filter((m) => m._id !== member._id && !spark?.hiddenFrom?.includes(m._id));
      await notify(ctx, {
        memberIds: others.map((m) => m._id),
        kind: `folded:${member._id}`,
        title: `${member.displayName} just folded`,
        body: "A new moment is in the Steamer.",
        url,
      });
    }
    return dumplingId;
  },
});

/** Only the person who folded a clip can take it back. Replies to it stay, as their own clips. */
export const remove = mutation({
  args: { ...sessionArgs, dumplingId: v.id("dumplings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args);
    const dumpling = await ctx.db.get("dumplings", args.dumplingId);
    if (!dumpling || dumpling.memberId !== member._id) throw new ConvexError("Only you can delete your own clips.");
    for await (const r of ctx.db.query("reactions").withIndex("by_dumplingId", (q) => q.eq("dumplingId", dumpling._id))) {
      if (r.audioStorageId) await ctx.storage.delete(r.audioStorageId);
      await ctx.db.delete("reactions", r._id);
    }
    for await (const child of ctx.db.query("dumplings").withIndex("by_replyTo", (q) => q.eq("replyTo", dumpling._id))) {
      await ctx.db.patch("dumplings", child._id, { replyTo: undefined });
    }
    await ctx.storage.delete(dumpling.mediaStorageId);
    await ctx.db.delete("dumplings", dumpling._id);
    return null;
  },
});

/** Owners decide whether their clip may be shared outside the Table from the Feast player. */
export const setShare = mutation({
  args: { ...sessionArgs, dumplingId: v.id("dumplings"), allowShare: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args);
    const dumpling = await ctx.db.get("dumplings", args.dumplingId);
    if (!dumpling || dumpling.memberId !== member._id) throw new ConvexError("Only you can change sharing for your clip.");
    await ctx.db.patch("dumplings", dumpling._id, { allowShare: args.allowShare });
    return null;
  },
});
