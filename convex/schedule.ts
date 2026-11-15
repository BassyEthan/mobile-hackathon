import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { addDays, dateInZone, fallbackFilling, localHour, weekOfFor } from "./lib";

export const SUNDAY_COOK_HOUR = 17;

export async function pendingSecretIngredient(ctx: QueryCtx, tableId: Id<"tables">, date: string) {
  const latestFeast = await ctx.db
    .query("feasts")
    .withIndex("by_tableId_and_weekOf", (q) => q.eq("tableId", tableId).lt("weekOf", date))
    .order("desc")
    .first();
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
  const existing = await ctx.db
    .query("feasts")
    .withIndex("by_tableId_and_weekOf", (q) => q.eq("tableId", table._id).eq("weekOf", weekOf))
    .first();
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
