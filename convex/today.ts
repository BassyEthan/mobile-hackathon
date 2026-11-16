import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { ensureFillingFor, markToday } from "./schedule";
import { addDays, avatarUrlFor, canSeeDumpling, currentDay, dateInZone, fillingHiddenFrom, isDate, requireMember, sessionArgs, sparksFor, tableMembers, weekOfFor } from "./lib";

const reactionSummary = v.object({
  counts: v.record(v.string(), v.number()),
  mine: v.array(v.string()),
  voices: v.array(v.object({ id: v.id("reactions"), memberName: v.string(), url: v.union(v.string(), v.null()) })),
});

export const revealedDumpling = v.object({
  id: v.id("dumplings"),
  memberId: v.id("members"),
  memberName: v.string(),
  memberAvatarUrl: v.union(v.string(), v.null()),
  mediaType: v.union(v.literal("video"), v.literal("audio"), v.literal("photo")),
  url: v.union(v.string(), v.null()),
  caption: v.union(v.string(), v.null()),
  createdAt: v.number(),
  spark: v.union(v.string(), v.null()),
  // Who asked, when the clip answers a family member's question directly.
  askedBy: v.union(v.string(), v.null()),
  replyTo: v.union(v.id("dumplings"), v.null()),
  replyToName: v.union(v.string(), v.null()),
  allowShare: v.boolean(),
  sealed: v.boolean(),
  reactions: reactionSummary,
});

async function askerOf(ctx: QueryCtx, dumpling: Doc<"dumplings">) {
  if (dumpling.askId) {
    const ask = await ctx.db.get("askQueue", dumpling.askId);
    const author = ask ? await ctx.db.get("members", ask.authorId) : null;
    if (author) return author.displayName;
  }
  if (dumpling.fillingId && dumpling.sparkKey === "primary") {
    const filling = await ctx.db.get("fillings", dumpling.fillingId);
    const author = filling?.authorId ? await ctx.db.get("members", filling.authorId) : null;
    if (author) return author.displayName;
  }
  return null;
}

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
    memberAvatarUrl: await avatarUrlFor(ctx, author),
    mediaType: dumpling.mediaType,
    url: await ctx.storage.getUrl(dumpling.mediaStorageId),
    caption: dumpling.translation?.[viewer.language] ?? dumpling.transcript ?? null,
    createdAt: dumpling.createdAt,
    spark: dumpling.hiddenFrom?.includes(viewer._id) ? null : (dumpling.sparkText ?? null),
    askedBy: await askerOf(ctx, dumpling),
    replyTo: parent?._id ?? null,
    replyToName: parent ? (parentAuthor?.displayName ?? "Someone") : null,
    allowShare: dumpling.allowShare ?? false,
    sealed: dumpling.sealed ?? false,
    reactions: { counts, mine, voices },
  };
}

export function tableWeek(table: Doc<"tables">, date: string) {
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
        sparks: v.array(v.object({ key: v.string(), english: v.string(), text: v.string(), type: v.string() })),
        authorName: v.union(v.string(), v.null()),
        addressedToName: v.union(v.string(), v.null()),
      }),
    ),
    members: v.array(v.object({ id: v.id("members"), displayName: v.string(), avatarUrl: v.union(v.string(), v.null()), folded: v.boolean(), isMe: v.boolean() })),
    lidOff: v.boolean(),
    week: v.number(),
    dumplings: v.array(revealedDumpling),
  }),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const date = isDate(args.date) ? args.date : dateInZone(table.createdAt, table.timeZone);
    const members = await tableMembers(ctx, table._id);
    const today = await currentDay(ctx, table);
    const found = today !== null && date <= today
      ? await ctx.db
          .query("fillings")
          .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).eq("date", date))
          .unique()
      : null;
    const filling = found && !fillingHiddenFrom(found, member._id) ? found : null;
    const todays = await ctx.db
      .query("dumplings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).eq("date", date))
      .take(200);
    const folded = new Set(
      todays.filter((d) => d.memberId === member._id || (!d.sealed && !d.hiddenFrom?.includes(member._id))).map((d) => d.memberId),
    );
    // Fold to see: a day's moments open only once you have added your own to that day, past days included.
    const lidOff = folded.has(member._id);
    const nameOf = (id: Doc<"members">["_id"] | undefined) => (id ? (members.find((m) => m._id === id)?.displayName ?? null) : null);
    const dumplings = [];
    if (lidOff) {
      for (const dumpling of todays.sort((a, b) => a.createdAt - b.createdAt)) {
        if (await canSeeDumpling(ctx, member, dumpling)) dumplings.push(await describeDumpling(ctx, member, dumpling));
      }
    }
    return {
      filling: filling
        ? {
            id: filling._id,
            date: filling.date,
            prompt: filling.text ?? filling.prompt,
            sparks: sparksFor(filling, member.language),
            authorName: nameOf(filling.authorId),
            addressedToName: nameOf(filling.addressedTo),
          }
        : null,
      members: await Promise.all(
        members.map(async (m) => ({
          id: m._id,
          displayName: m.displayName,
          avatarUrl: await avatarUrlFor(ctx, m),
          folded: folded.has(m._id),
          isMe: m._id === member._id,
        })),
      ),
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
    return await ensureFillingFor(ctx, table, await markToday(ctx, table, Date.now()));
  },
});

/** The day strip: the last seven days, with how many clips each holds and whether you folded. */
export const week = query({
  args: { ...sessionArgs, date: v.string() },
  returns: v.array(v.object({ date: v.string(), clips: v.number(), mine: v.boolean() })),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    if (!isDate(args.date)) return [];
    const from = addDays(args.date, -6);
    const rows = await ctx.db
      .query("dumplings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).gte("date", from).lte("date", args.date))
      .take(400);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(from, i);
      const day = rows.filter((d) => d.date === date);
      return { date, clips: day.length, mine: day.some((d) => d.memberId === member._id) };
    });
  },
});

/**
 * The calendar: every day from `from` to `to` (at most 42, one month grid), with how many moments each holds and
 * whether you folded. Also returns the first day of the Table, so the calendar never offers days before it existed.
 */
export const range = query({
  args: { ...sessionArgs, from: v.string(), to: v.string() },
  returns: v.object({
    start: v.string(),
    days: v.array(v.object({ date: v.string(), clips: v.number(), mine: v.boolean() })),
  }),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const start = dateInZone(table.createdAt, table.timeZone);
    if (!isDate(args.from) || !isDate(args.to) || args.to < args.from) return { start, days: [] };
    const to = args.to > addDays(args.from, 41) ? addDays(args.from, 41) : args.to;
    const rows = await ctx.db
      .query("dumplings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).gte("date", args.from).lte("date", to))
      .take(2000);
    const days = [];
    for (let date = args.from; date <= to; date = addDays(date, 1)) {
      const day = rows.filter((d) => d.date === date);
      days.push({ date, clips: day.length, mine: day.some((d) => d.memberId === member._id) });
    }
    return { start, days };
  },
});

/** Questions a family member asked you directly, so "Maya asked you something" opens the actual question. */
export const asksForMe = query({
  args: sessionArgs,
  returns: v.array(v.object({ id: v.id("askQueue"), authorName: v.string(), text: v.string(), createdAt: v.number() })),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const pending = await ctx.db
      .query("askQueue")
      .withIndex("by_tableId_and_usedOn", (q) => q.eq("tableId", table._id).eq("usedOn", undefined))
      .order("desc")
      .take(30);
    const rows = [];
    for (const a of pending) {
      if (a.addressedTo !== member._id || a.answeredBy) continue;
      const author = await ctx.db.get("members", a.authorId);
      rows.push({ id: a._id, authorName: author?.displayName ?? "Someone", text: a.text, createdAt: a.createdAt });
    }
    return rows.slice(0, 3);
  },
});
