import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { segment } from "./schema";
import { addDays, canSeeDumpling, isDayOpen, seatLine, requireMember, sessionArgs } from "./lib";
import { startCook } from "./schedule";
import { describeDumpling, revealedDumpling } from "./today";

const feastSummary = v.object({
  id: v.id("feasts"),
  title: v.string(),
  weekOf: v.string(),
  status: v.union(v.literal("cooking"), v.literal("ready"), v.literal("failed")),
  error: v.union(v.string(), v.null()),
  segmentCount: v.number(),
});

export const list = query({
  args: sessionArgs,
  returns: v.array(feastSummary),
  handler: async (ctx, args) => {
    const { table } = await requireMember(ctx, args);
    const feasts = await ctx.db
      .query("feasts")
      .withIndex("by_tableId_and_weekOf", (q) => q.eq("tableId", table._id))
      .order("desc")
      .take(8);
    return feasts.map((f) => ({
      id: f._id,
      title: f.title,
      weekOf: f.weekOf,
      status: f.status,
      error: f.error ?? null,
      segmentCount: f.segments.length,
    }));
  },
});

const playableSegment = v.union(
  v.object({ type: v.literal("hostLine"), text: v.string(), audioUrl: v.union(v.string(), v.null()) }),
  v.object({ type: v.literal("clip"), dumpling: revealedDumpling }),
  v.object({
    type: v.literal("titleCard"),
    title: v.string(),
    subtitle: v.union(v.string(), v.null()),
    phrase: v.union(v.string(), v.null()),
    romanization: v.union(v.string(), v.null()),
    meaning: v.union(v.string(), v.null()),
  }),
  v.object({ type: v.literal("award"), award: v.string(), memberName: v.string(), text: v.string() }),
  v.object({ type: v.literal("secretIngredient"), prompt: v.string(), text: v.string() }),
);

export const get = query({
  args: { ...sessionArgs, feastId: v.id("feasts") },
  returns: v.union(
    v.null(),
    v.object({ title: v.string(), chefName: v.string(), status: v.string(), segments: v.array(playableSegment) }),
  ),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const feast = await ctx.db.get("feasts", args.feastId);
    if (!feast || feast.tableId !== table._id) return null;
    const segments = [];
    for (const s of feast.segments) {
      if (s.type === "hostLine") {
        segments.push({
          type: s.type,
          text: s.translations?.[member.language] ?? s.text,
          audioUrl: s.audioStorageId ? await ctx.storage.getUrl(s.audioStorageId) : null,
        });
      } else if (s.type === "clip") {
        const dumpling = await ctx.db.get("dumplings", s.dumplingId);
        if (dumpling && (await canSeeDumpling(ctx, member, dumpling, { inFeast: feast.status === "ready" }))) {
          segments.push({ type: s.type, dumpling: await describeDumpling(ctx, member, dumpling) });
        }
      } else if (s.type === "titleCard") {
        segments.push({
          type: s.type,
          title: s.title,
          subtitle: s.subtitle ?? null,
          phrase: s.phrase ?? null,
          romanization: s.romanization ?? null,
          meaning: s.meaning ?? null,
        });
      } else if (s.type === "award" && s.award === "Empty Plate") {
        segments.push({ type: "hostLine" as const, text: seatLine(s.memberName), audioUrl: null });
      } else if (s.type === "award") {
        segments.push({ type: s.type, award: s.award, memberName: s.memberName, text: s.translations?.[member.language] ?? s.text });
      } else {
        segments.push({ type: s.type, prompt: s.prompt, text: s.translations?.[member.language] ?? s.text });
      }
    }
    return { title: feast.title, chefName: table.chefName, status: feast.status, segments };
  },
});

export const cook = mutation({
  args: sessionArgs,
  returns: v.id("feasts"),
  handler: async (ctx, args) => {
    const { table } = await requireMember(ctx, args);
    return await startCook(ctx, table, Date.now());
  },
});

export const retry = mutation({
  args: { ...sessionArgs, feastId: v.id("feasts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { table } = await requireMember(ctx, args);
    const feast = await ctx.db.get("feasts", args.feastId);
    if (!feast || feast.tableId !== table._id) throw new ConvexError("That Feast is not on your Table.");
    if (feast.status !== "failed") return null;
    await ctx.db.patch("feasts", feast._id, { status: "cooking", error: undefined, createdAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.chef.cook, { feastId: feast._id });
    return null;
  },
});

const gatheredClip = v.object({
  id: v.id("dumplings"),
  memberId: v.id("members"),
  memberName: v.string(),
  date: v.string(),
  prompt: v.union(v.string(), v.null()),
  sparkId: v.union(v.string(), v.null()),
  sealed: v.boolean(),
  mediaType: v.string(),
  transcript: v.union(v.string(), v.null()),
  language: v.union(v.string(), v.null()),
  english: v.union(v.string(), v.null()),
  reactionCount: v.number(),
  voiceCount: v.number(),
});

export const gather = internalQuery({
  args: { feastId: v.id("feasts") },
  returns: v.union(
    v.null(),
    v.object({
      tableId: v.id("tables"),
      tableName: v.string(),
      chefName: v.string(),
      weekOf: v.string(),
      members: v.array(v.object({ id: v.id("members"), name: v.string(), language: v.string() })),
      clips: v.array(gatheredClip),
      previous: v.union(v.null(), v.object({ title: v.string(), secretIngredient: v.union(v.string(), v.null()), lines: v.array(v.string()) })),
    }),
  ),
  handler: async (ctx, args) => {
    const feast = await ctx.db.get("feasts", args.feastId);
    if (!feast) return null;
    const table = await ctx.db.get("tables", feast.tableId);
    if (!table) return null;
    const members = await ctx.db.query("members").withIndex("by_tableId", (q) => q.eq("tableId", table._id)).take(50);
    const names = new Map(members.map((m) => [m._id, m.displayName]));
    const dumplings = await ctx.db
      .query("dumplings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).gte("date", addDays(feast.weekOf, -6)).lte("date", feast.weekOf))
      .take(80);
    const clips = [];
    for (const d of dumplings) {
      if (!d.date || (await isDayOpen(ctx, table, d.date))) continue;
      const filling = !d.sparkText && d.fillingId && d.answeredSpark !== false ? await ctx.db.get("fillings", d.fillingId) : null;
      const reactions = await ctx.db.query("reactions").withIndex("by_dumplingId", (q) => q.eq("dumplingId", d._id)).take(200);
      clips.push({
        id: d._id,
        memberId: d.memberId,
        memberName: names.get(d.memberId) ?? "Someone",
        date: d.date,
        prompt: d.hiddenFrom?.length ? null : (d.sparkText ?? filling?.prompt ?? null),
        sparkId: d.fillingId && d.answeredSpark !== false ? `${d.fillingId}:${d.sparkKey ?? "primary"}` : null,
        sealed: d.sealed ?? false,
        mediaType: d.mediaType,
        transcript: d.transcript ?? null,
        language: d.language ?? null,
        english: d.language === "en" ? (d.transcript ?? null) : (d.translation?.en ?? null),
        reactionCount: reactions.length,
        voiceCount: reactions.filter((r) => r.audioStorageId).length,
      });
    }
    const previousFeast = (
      await ctx.db
        .query("feasts")
        .withIndex("by_tableId_and_weekOf", (q) => q.eq("tableId", table._id).lte("weekOf", feast.weekOf))
        .order("desc")
        .take(6)
    ).find((f) => f._id !== feast._id && f.status === "ready" && f.createdAt < feast.createdAt);
    return {
      tableId: table._id,
      tableName: table.name,
      chefName: table.chefName,
      weekOf: feast.weekOf,
      members: members.map((m) => ({ id: m._id, name: m.displayName, language: m.language })),
      clips,
      previous: previousFeast
        ? {
            title: previousFeast.title,
            secretIngredient: previousFeast.secretIngredient ?? null,
            lines: previousFeast.segments.flatMap((s) => (s.type === "hostLine" ? [s.text] : s.type === "award" ? [`${s.award}: ${s.memberName}`] : [])),
          }
        : null,
    };
  },
});

export const finish = internalMutation({
  args: { feastId: v.id("feasts"), title: v.string(), segments: v.array(segment), secretIngredient: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("feasts", args.feastId, {
      title: args.title,
      segments: args.segments,
      secretIngredient: args.secretIngredient,
      status: "ready",
      error: undefined,
    });
    return null;
  },
});

export const fail = internalMutation({
  args: { feastId: v.id("feasts"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("feasts", args.feastId, { status: "failed", error: args.error, title: "The Feast burned" });
    return null;
  },
});
