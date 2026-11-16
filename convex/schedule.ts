import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { addDays, dateInZone, fallbackFilling, localHour, weekOfFor } from "./lib";

export const SUNDAY_COOK_HOUR = 17;

export async function pendingSecretIngredient(ctx: QueryCtx, tableId: Id<"tables">, date: string) {
  // Extra Helpings never hand out next week's first Filling; only the Sunday Feast does.
  const latestFeast = (
    await ctx.db
      .query("feasts")
      .withIndex("by_tableId_and_weekOf", (q) => q.eq("tableId", tableId).lt("weekOf", date))
      .order("desc")
      .take(10)
  ).find((f) => f.kind !== "special");
  return latestFeast?.status === "ready" && latestFeast.secretIngredient && !latestFeast.nextFillingId ? latestFeast : null;
}

export async function markToday(ctx: MutationCtx, table: Doc<"tables">, now: number) {
  const date = dateInZone(now, table.timeZone);
  if (!table.today || table.today < date) await ctx.db.patch("tables", table._id, { today: date });
  return date;
}

export async function ensureFillingFor(ctx: MutationCtx, table: Doc<"tables">, date: string) {
  const existing = await ctx.db
    .query("fillings")
    .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).eq("date", date))
    .unique();
  if (existing) return existing._id;
  const recent = await ctx.db
    .query("fillings")
    .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).lt("date", date))
    .order("desc")
    .take(21);
  const { primary, moreSparks } = fallbackFilling(date, recent.map((f) => ({ text: f.text ?? f.prompt, type: f.type })));
  const secret = await pendingSecretIngredient(ctx, table._id, date);
  const text = secret?.secretIngredient ?? primary.text;
  const type = secret ? "tell" : primary.type;
  const fillingId = await ctx.db.insert("fillings", {
    tableId: table._id,
    date,
    prompt: text,
    text,
    type,
    moreSparks: moreSparks.filter((m) => m.type !== type).map((m) => ({ text: m.text, type: m.type as "show" | "tell" | "together" | "sealed" })),
    source: secret ? "secretIngredient" : "fallback",
  });
  if (secret) await ctx.db.patch("feasts", secret._id, { nextFillingId: fillingId });
  return fillingId;
}

export async function startCook(ctx: MutationCtx, table: Doc<"tables">, now: number) {
  const weekOf = weekOfFor(dateInZone(now, table.timeZone));
  const existing = (
    await ctx.db
      .query("feasts")
      .withIndex("by_tableId_and_weekOf", (q) => q.eq("tableId", table._id).eq("weekOf", weekOf))
      .take(20)
  ).find((f) => f.kind !== "special");
  if (existing && existing.status !== "failed") return existing._id;
  if (existing) {
    await ctx.db.patch("feasts", existing._id, { status: "cooking", error: undefined, title: "Cooking…", createdAt: now });
    await ctx.scheduler.runAfter(0, internal.chef.cook, { feastId: existing._id });
    return existing._id;
  }
  const feastId = await ctx.db.insert("feasts", {
    tableId: table._id,
    weekOf,
    title: "Cooking…",
    status: "cooking",
    segments: [],
    createdAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.chef.cook, { feastId });
  return feastId;
}

const SPECIAL_COOLDOWN_MS = 10 * 60_000;

/**
 * An Extra Helping: a Feast cooked whenever the family asks, from the last seven days including today. Its weekOf is the
 * day it was cooked, which the Chef's gather window reads as "the seven days up to today". Sealed folds still wait for
 * Sunday, and today's folds only play for people who have folded today, as everywhere else.
 */
export async function startSpecial(ctx: MutationCtx, table: Doc<"tables">, now: number) {
  const recent = await ctx.db
    .query("feasts")
    .withIndex("by_tableId_and_weekOf", (q) => q.eq("tableId", table._id))
    .order("desc")
    .take(10);
  if (recent.some((f) => f.status === "cooking")) throw new ConvexError("The Chef is already cooking. It will be ready in about a minute.");
  const last = recent.filter((f) => f.kind === "special").sort((a, b) => b.createdAt - a.createdAt)[0];
  if (last && now - last.createdAt < SPECIAL_COOLDOWN_MS) {
    const minutes = Math.ceil((SPECIAL_COOLDOWN_MS - (now - last.createdAt)) / 60_000);
    throw new ConvexError(`The Chef just served one. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`);
  }
  const today = dateInZone(now, table.timeZone);
  const folds = await ctx.db
    .query("dumplings")
    .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).gte("date", addDays(today, -6)).lte("date", today))
    .take(80);
  if (!folds.some((d) => !d.sealed && !d.hiddenFrom?.length)) throw new ConvexError("Nothing to cook yet. Fold a moment or two first.");
  const feastId = await ctx.db.insert("feasts", {
    tableId: table._id,
    weekOf: today,
    title: "Cooking…",
    status: "cooking",
    segments: [],
    kind: "special",
    createdAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.chef.cook, { feastId });
  return feastId;
}

export const dailyFillings = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("tables").paginate({ numItems: 50, cursor: args.cursor ?? null });
    const now = Date.now();
    for (const table of page.page) await ensureFillingFor(ctx, table, await markToday(ctx, table, now));
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.schedule.dailyFillings, { cursor: page.continueCursor });
    return null;
  },
});

export const sundayFeasts = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("tables").paginate({ numItems: 50, cursor: args.cursor ?? null });
    const now = Date.now();
    for (const table of page.page) {
      const date = dateInZone(now, table.timeZone);
      if (weekOfFor(date) === date && localHour(now, table.timeZone) >= Math.max(0, (table.feastHour ?? SUNDAY_COOK_HOUR + 1) - 1)) await startCook(ctx, table, now);
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.schedule.sundayFeasts, { cursor: page.continueCursor });
    return null;
  },
});
