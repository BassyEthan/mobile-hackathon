import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { canSeeDumpling, requireMember, sessionArgs } from "./lib";
import { segmentsByMember } from "./tables";

const tile = v.object({
  id: v.id("dumplings"),
  mediaType: v.union(v.literal("video"), v.literal("audio")),
  url: v.union(v.string(), v.null()),
  date: v.string(),
  caption: v.union(v.string(), v.null()),
  sealed: v.boolean(),
});

/**
 * A member's profile. Your own profile shows everything you recorded, including sealed clips; someone else's shows only
 * what the Table's lid and seal rules already let you see.
 */
export const profile = query({
  args: { ...sessionArgs, targetId: v.id("members") },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("members"),
      displayName: v.string(),
      nickname: v.union(v.string(), v.null()),
      languages: v.array(v.string()),
      role: v.union(v.literal("host"), v.literal("member"), v.literal("guest")),
      isMe: v.boolean(),
      isElder: v.boolean(),
      clips: v.array(tile),
      segment: v.union(
        v.null(),
        v.object({ title: v.string(), episodes: v.array(v.object({ feastId: v.id("feasts"), title: v.string(), weekOf: v.string() })) }),
      ),
      phrases: v.array(
        v.object({ id: v.id("phraseAttempts"), phrase: v.string(), meaning: v.union(v.string(), v.null()), url: v.union(v.string(), v.null()), createdAt: v.number() }),
      ),
      awards: v.array(v.object({ feastId: v.id("feasts"), award: v.string(), text: v.string(), weekOf: v.string() })),
    }),
  ),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const target = await ctx.db.get("members", args.targetId);
    if (!target || target.tableId !== table._id || target.leftAt) return null;
    const isMe = target._id === member._id;

    const recent = await ctx.db
      .query("dumplings")
      .withIndex("by_memberId_and_createdAt", (q) => q.eq("memberId", target._id))
      .order("desc")
      .take(isMe ? 60 : 24);
    const clips = [];
    for (const d of recent) {
      if (!isMe && !(await canSeeDumpling(ctx, member, d))) continue;
      clips.push({
        id: d._id,
        mediaType: d.mediaType,
        url: await ctx.storage.getUrl(d.mediaStorageId),
        date: d.date ?? new Date(d.createdAt).toISOString().slice(0, 10),
        caption: d.translation?.[member.language] ?? d.transcript ?? null,
        sealed: d.sealed ?? false,
      });
    }

    const feasts = await ctx.db
      .query("feasts")
      .withIndex("by_tableId_and_weekOf", (q) => q.eq("tableId", table._id))
      .order("desc")
      .take(52);
    const ready = feasts.filter((f) => f.status === "ready");

    const segmentTitle = (await segmentsByMember(ctx, table._id)).get(target._id) ?? null;
    const segment = segmentTitle
      ? {
          title: segmentTitle,
          episodes: ready
            .filter((f) => f.segments.some((s) => s.type === "titleCard" && s.title.toLowerCase() === segmentTitle.toLowerCase()))
            .map((f) => ({ feastId: f._id, title: f.title, weekOf: f.weekOf })),
        }
      : null;

    const awards = [];
    for (const f of ready) {
      for (const s of f.segments) {
        if (s.type !== "award" || s.award === "Empty Plate") continue;
        const winner: Doc<"dumplings"> | null = s.dumplingId ? await ctx.db.get("dumplings", s.dumplingId) : null;
        const won = winner ? winner.memberId === target._id : s.memberName === target.displayName;
        if (won) awards.push({ feastId: f._id, award: s.award, text: s.translations?.[member.language] ?? s.text, weekOf: f.weekOf });
      }
    }

    const phrases = [];
    if (isMe) {
      const attempts = await ctx.db
        .query("phraseAttempts")
        .withIndex("by_memberId_and_createdAt", (q) => q.eq("memberId", member._id))
        .order("desc")
        .take(30);
      for (const a of attempts) {
        phrases.push({ id: a._id, phrase: a.phrase, meaning: a.meaning ?? null, url: await ctx.storage.getUrl(a.storageId), createdAt: a.createdAt });
      }
    }

    return {
      id: target._id,
      displayName: target.displayName,
      nickname: target.nickname ?? null,
      languages: target.spokenLanguages ?? [target.motherTongue ?? target.language],
      role: target.role,
      isMe,
      isElder: target.isElder ?? false,
      clips,
      segment,
      phrases,
      awards,
    };
  },
});

/** Saying a Mother Tongue phrase back from the Feast. Your attempts live on your profile. */
export const attemptPhrase = mutation({
  args: { ...sessionArgs, feastId: v.id("feasts"), phrase: v.string(), meaning: v.optional(v.string()), storageId: v.id("_storage") },
  returns: v.id("phraseAttempts"),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const feast = await ctx.db.get("feasts", args.feastId);
    if (!feast || feast.tableId !== table._id) throw new ConvexError("That Feast is not on your Table.");
    const card = feast.segments.find((s) => s.type === "titleCard" && s.phrase === args.phrase);
    if (!card || card.type !== "titleCard") throw new ConvexError("That phrase is not in this Feast.");
    const file = await ctx.db.system.get("_storage", args.storageId);
    if (!file || file.size > 5 * 1024 * 1024) throw new ConvexError("That recording did not upload. Try again.");
    return await ctx.db.insert("phraseAttempts", {
      memberId: member._id,
      feastId: feast._id,
      phrase: card.phrase ?? args.phrase,
      ...(card.meaning ? { meaning: card.meaning } : {}),
      storageId: args.storageId,
      createdAt: Date.now(),
    });
  },
});
