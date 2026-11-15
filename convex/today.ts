import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ensureFillingFor } from "./schedule";
import { canSeeDumpling, dateInZone, isDate, isDayOpen, requireMember, sessionArgs, sparksFor, weekOfFor } from "./lib";

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
  spark: v.union(v.string(), v.null()),
  replyTo: v.union(v.id("dumplings"), v.null()),
  replyToName: v.union(v.string(), v.null()),
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
  const parent = dumpling.replyTo ? await ctx.db.get("dumplings", dumpling.replyTo) : null;
  const parentAuthor = parent ? await ctx.db.get("members", parent.memberId) : null;
  return {
    id: dumpling._id,
    memberId: dumpling.memberId,
    memberName: author?.displayName ?? "Someone",
    mediaType: dumpling.mediaType,
    url: await ctx.storage.getUrl(dumpling.mediaStorageId),
    caption: dumpling.translation?.[viewer.language] ?? dumpling.transcript ?? null,
    createdAt: dumpling.createdAt,
    spark: dumpling.sparkText ?? null,
    replyTo: parent?._id ?? null,
    replyToName: parent ? (parentAuthor?.displayName ?? "Someone") : null,
    reactions: { counts, mine, voices },
  };
}

function tableWeek(table: Doc<"tables">, date: string) {
  const first = weekOfFor(dateInZone(table.createdAt, table.timeZone));
  const days = Math.round((Date.parse(`${weekOfFor(date)}T12:00:00Z`) - Date.parse(`${first}T12:00:00Z`)) / 86_400_000);
  return Math.max(1, Math.floor(days / 7) + 1);
}

export const get = query({
  args: { ...sessionArgs, date: v.string() },
  returns: v.object({
    filling: v.union(
      v.null(),
      v.object({
        id: v.id("fillings"),
        date: v.string(),
        prompt: v.string(),
        sparks: v.array(v.object({ key: v.string(), text: v.string() })),
      }),
    ),
    members: v.array(v.object({ id: v.id("members"), displayName: v.string(), folded: v.boolean(), isMe: v.boolean() })),
    lidOff: v.boolean(),
    week: v.number(),
    dumplings: v.array(revealedDumpling),
  }),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const date = isDate(args.date) ? args.date : dateInZone(table.createdAt, table.timeZone);
    const members = await ctx.db.query("members").withIndex("by_tableId", (q) => q.eq("tableId", table._id)).take(50);
    const filling = await ctx.db
      .query("fillings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).eq("date", date))
      .unique();
    const todays = await ctx.db
      .query("dumplings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).eq("date", date))
      .take(200);
    const folded = new Set(todays.map((d) => d.memberId));
    const lidOff = folded.has(member._id) || !(await isDayOpen(ctx, table, date));
    const dumplings = [];
    if (lidOff) {
      for (const dumpling of todays.sort((a, b) => a.createdAt - b.createdAt)) {
        if (await canSeeDumpling(ctx, member, dumpling)) dumplings.push(await describeDumpling(ctx, member, dumpling));
      }
    }
    return {
      filling: filling ? { id: filling._id, date: filling.date, prompt: filling.prompt, sparks: sparksFor(filling) } : null,
      members: members.map((m) => ({
        id: m._id,
        displayName: m.displayName,
        folded: folded.has(m._id),
        isMe: m._id === member._id,
      })),
      lidOff,
      week: tableWeek(table, date),
      dumplings,
    };
  },
});

export const ensureFilling = mutation({
  args: sessionArgs,
  returns: v.id("fillings"),
  handler: async (ctx, args) => {
    const { table } = await requireMember(ctx, args);
    return await ensureFillingFor(ctx, table, dateInZone(Date.now(), table.timeZone));
  },
});
