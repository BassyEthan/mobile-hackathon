import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { FILLING_PROMPTS, dateInZone, isDate, isFillingOpen, requireMember } from "./lib";

const reactionSummary = v.object({
  counts: v.record(v.string(), v.number()),
  mine: v.array(v.string()),
  voices: v.array(v.object({ id: v.id("reactions"), memberName: v.string(), url: v.union(v.string(), v.null()) })),
});

export const revealedDumpling = v.object({
  id: v.id("dumplings"),
  memberId: v.id("members"),
  memberName: v.string(),
  mediaType: v.union(v.literal("video"), v.literal("audio")),
  url: v.union(v.string(), v.null()),
  caption: v.union(v.string(), v.null()),
  createdAt: v.number(),
  reactions: reactionSummary,
});

export async function describeDumpling(ctx: QueryCtx, viewer: Doc<"members">, dumpling: Doc<"dumplings">) {
  const author = await ctx.db.get("members", dumpling.memberId);
  const reactions = await ctx.db
    .query("reactions")
    .withIndex("by_dumplingId", (q) => q.eq("dumplingId", dumpling._id))
    .take(200);
  const counts: Record<string, number> = {};
  const mine: string[] = [];
  const voices = [];
  for (const reaction of reactions) {
    counts[reaction.kind] = (counts[reaction.kind] ?? 0) + 1;
    if (reaction.memberId === viewer._id) mine.push(reaction.kind);
    if (reaction.audioStorageId) {
      const reactor = await ctx.db.get("members", reaction.memberId);
      voices.push({
        id: reaction._id,
        memberName: reactor?.displayName ?? "Someone",
        url: await ctx.storage.getUrl(reaction.audioStorageId),
      });
    }
  }
  return {
    id: dumpling._id,
    memberId: dumpling.memberId,
    memberName: author?.displayName ?? "Someone",
    mediaType: dumpling.mediaType,
    url: await ctx.storage.getUrl(dumpling.mediaStorageId),
    caption: dumpling.translation?.[viewer.language] ?? dumpling.transcript ?? null,
    createdAt: dumpling.createdAt,
    reactions: { counts, mine, voices },
  };
}

export const get = query({
  args: { token: v.string(), date: v.string() },
  returns: v.object({
    filling: v.union(v.null(), v.object({ id: v.id("fillings"), date: v.string(), prompt: v.string() })),
    members: v.array(v.object({ id: v.id("members"), displayName: v.string(), folded: v.boolean(), isMe: v.boolean() })),
    lidOff: v.boolean(),
    dumplings: v.array(revealedDumpling),
  }),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args.token);
    const members = await ctx.db.query("members").withIndex("by_tableId", (q) => q.eq("tableId", table._id)).take(50);
    const filling = isDate(args.date)
      ? await ctx.db
          .query("fillings")
          .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).eq("date", args.date))
          .unique()
      : null;
    if (!filling) {
      return {
        filling: null,
        members: members.map((m) => ({ id: m._id, displayName: m.displayName, folded: false, isMe: m._id === member._id })),
        lidOff: false,
        dumplings: [],
      };
    }
    const folded = new Map<string, Doc<"dumplings">>();
    for (const m of members) {
      const dumpling = await ctx.db
        .query("dumplings")
        .withIndex("by_fillingId_and_memberId", (q) => q.eq("fillingId", filling._id).eq("memberId", m._id))
        .first();
      if (dumpling) folded.set(m._id, dumpling);
    }
    const lidOff = folded.has(member._id) || !(await isFillingOpen(ctx, filling));
    const dumplings = [];
    if (lidOff) {
      for (const dumpling of [...folded.values()].sort((a, b) => a.createdAt - b.createdAt)) {
        dumplings.push(await describeDumpling(ctx, member, dumpling));
      }
    }
    return {
      filling: { id: filling._id, date: filling.date, prompt: filling.prompt },
      members: members.map((m) => ({
        id: m._id,
        displayName: m.displayName,
        folded: folded.has(m._id),
        isMe: m._id === member._id,
      })),
      lidOff,
      dumplings,
    };
  },
});

export const ensureFilling = mutation({
  args: { token: v.string() },
  returns: v.id("fillings"),
  handler: async (ctx, args) => {
    const { table } = await requireMember(ctx, args.token);
    const date = dateInZone(Date.now(), table.timeZone);
    const existing = await ctx.db
      .query("fillings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).eq("date", date))
      .unique();
    if (existing) return existing._id;
    const latestFeast = await ctx.db
      .query("feasts")
      .withIndex("by_tableId_and_weekOf", (q) => q.eq("tableId", table._id).lt("weekOf", date))
      .order("desc")
      .first();
    if (latestFeast?.status === "ready" && latestFeast.secretIngredient && !latestFeast.nextFillingId) {
      const fillingId = await ctx.db.insert("fillings", { tableId: table._id, date, prompt: latestFeast.secretIngredient });
      await ctx.db.patch("feasts", latestFeast._id, { nextFillingId: fillingId });
      return fillingId;
    }
    const previous = await ctx.db
      .query("fillings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).lt("date", date))
      .order("desc")
      .take(FILLING_PROMPTS.length - 1);
    const used = new Set(previous.map((f) => f.prompt));
    const fresh = FILLING_PROMPTS.filter((p) => !used.has(p));
    const pool = fresh.length > 0 ? fresh : FILLING_PROMPTS;
    const index = Number(date.replaceAll("-", "")) % pool.length;
    return await ctx.db.insert("fillings", { tableId: table._id, date, prompt: pool[index] });
  },
});
