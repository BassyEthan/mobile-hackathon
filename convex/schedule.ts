import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { FILLING_PROMPTS, dateInZone, localHour, weekOfFor } from "./lib";

export const SUNDAY_COOK_HOUR = 17;

export async function ensureFillingFor(ctx: MutationCtx, table: Doc<"tables">, date: string) {
  if (!table.today || table.today < date) await ctx.db.patch("tables", table._id, { today: date });
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
    for (const table of page.page) await ensureFillingFor(ctx, table, dateInZone(now, table.timeZone));
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
      if (weekOfFor(date) === date && localHour(now, table.timeZone) >= SUNDAY_COOK_HOUR) await startCook(ctx, table, now);
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.schedule.sundayFeasts, { cursor: page.continueCursor });
    return null;
  },
});
