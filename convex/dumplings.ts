import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { canSeeDumpling, dateInZone, requireMember, sessionArgs, sparksFor } from "./lib";

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
    mediaType: v.union(v.literal("video"), v.literal("audio")),
    fillingId: v.optional(v.id("fillings")),
    sparkKey: v.optional(v.string()),
    replyTo: v.optional(v.id("dumplings")),
  },
  returns: v.id("dumplings"),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const now = Date.now();
    const date = dateInZone(now, table.timeZone);
    let spark: { fillingId: Id<"fillings">; sparkKey: string; sparkText: string } | null = null;
    if (args.fillingId) {
      if (args.replyTo) throw new ConvexError("Fold back or answer the spark, one at a time.");
      const filling = await ctx.db.get("fillings", args.fillingId);
      if (!filling || filling.tableId !== table._id) throw new ConvexError("That spark belongs to another Table.");
      if (filling.date !== date) throw new ConvexError("That spark has passed. Fold anything instead.");
      const chosen = sparksFor(filling).find((s) => s.key === (args.sparkKey ?? "primary"));
      if (!chosen) throw new ConvexError("Pick one of today's sparks.");
      spark = { fillingId: filling._id, sparkKey: chosen.key, sparkText: chosen.text };
    } else if (args.sparkKey !== undefined) {
      throw new ConvexError("Pick one of today's sparks.");
    }
    if (args.replyTo) {
      const parent = await ctx.db.get("dumplings", args.replyTo);
      if (!parent || !(await canSeeDumpling(ctx, member, parent))) throw new ConvexError("That clip is not open to you.");
    }
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file) throw new ConvexError("The upload did not arrive. Try again.");
    if (file.size > MAX_BYTES) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError("That clip is too large.");
    }
    if (!table.today || table.today < date) await ctx.db.patch("tables", table._id, { today: date });
    const dumplingId = await ctx.db.insert("dumplings", {
      tableId: table._id,
      memberId: member._id,
      date,
      answeredSpark: spark !== null,
      ...(spark ?? {}),
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      mediaStorageId: args.storageId,
      mediaType: args.mediaType,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, internal.ai.processDumpling, { dumplingId });
    return dumplingId;
  },
});
