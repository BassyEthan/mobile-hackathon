import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export const sessionArgs = { token: v.string(), memberId: v.id("members") };
type Session = { token: string; memberId: Id<"members"> };

export const LANGUAGES = ["en", "es", "zh", "ko", "ja", "vi", "tl", "hi", "fr"];

export const FILLING_PROMPTS = [
  "What did you eat today that made you smile?",
  "Show us the view from where you are right now.",
  "Teach us one word from your day.",
  "What is something small that went right?",
  "Who did you talk to today, and what did they say?",
  "Show us something you made with your hands.",
  "What is a sound you heard today?",
  "What would you cook for the whole table tonight?",
  "Show us your shoes and where they took you.",
  "What made you laugh this week?",
  "What is one thing you want the family to know?",
  "Show us the messiest corner of your day.",
];

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomString(length: number, alphabet: string) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function dateInZone(ms: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function weekOfFor(date: string) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, (7 - day) % 7);
}

export function localHour(ms: number, timeZone: string) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(new Date(ms)));
}

export async function findMember(ctx: QueryCtx, session: Session) {
  const tokenHash = await hashToken(session.token);
  const member = await ctx.db
    .query("members")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!member || member._id !== session.memberId) return null;
  const table = await ctx.db.get("tables", member.tableId);
  if (!table) return null;
  return { member, table };
}

export async function requireMember(ctx: QueryCtx, args: Session) {
  const session = await findMember(ctx, args);
  if (!session) throw new ConvexError("Your seat at this Table has expired. Join again.");
  return session;
}

export const SAFE_SPARKS: Array<{ text: string; type: string }> = [
  { text: "What did you eat today that made you smile?", type: "food" },
  { text: "Show us the view from where you are right now.", type: "show" },
  { text: "Teach us one word from your day.", type: "teach" },
  { text: "What is something small that went right?", type: "gratitude" },
  { text: "Who did you talk to today, and what did they say?", type: "story" },
  { text: "Show us something you made with your hands.", type: "show" },
  { text: "What is a sound you heard today?", type: "senses" },
  { text: "What would you cook for the whole table tonight?", type: "food" },
  { text: "Show us your shoes and where they took you.", type: "show" },
  { text: "What made you laugh this week?", type: "story" },
  { text: "Show us the oldest thing in your kitchen.", type: "memory" },
  { text: "Hum a song that has been stuck in your head.", type: "play" },
  { text: "What did your hands do today?", type: "senses" },
  { text: "Show us the last thing that made you say wow.", type: "show" },
  { text: "Tell us about a meal you still think about.", type: "memory" },
  { text: "What is the best thing on your table right now?", type: "food" },
  { text: "Show us your favorite cup and tell us why.", type: "show" },
  { text: "What is one thing you learned this week?", type: "teach" },
  { text: "Who would you call right now if you could?", type: "gratitude" },
  { text: "Rate today's weather like a food critic.", type: "play" },
];

export function seatLine(name: string) {
  return `${name}, we saved you a seat.`;
}

export const SPARK_KEYS = ["primary", "alt0", "alt1", "alt2"] as const;

export function sparksFor(filling: Doc<"fillings">) {
  const seed = Number(filling.date.replaceAll("-", ""));
  const pool = SAFE_SPARKS.filter((s) => s.text !== filling.prompt);
  const alternates: string[] = [];
  for (let i = 0; alternates.length < 3; i++) alternates.push(pool[(seed + i * 7) % pool.length].text);
  return [filling.prompt, ...alternates].map((text, i) => ({ key: SPARK_KEYS[i], text }));
}

export async function currentDay(ctx: QueryCtx, table: Doc<"tables">) {
  if (table.today) return table.today;
  const latest = await ctx.db
    .query("fillings")
    .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id))
    .order("desc")
    .first();
  return latest?.date ?? null;
}

export async function isDayOpen(ctx: QueryCtx, table: Doc<"tables">, date: string) {
  const today = await currentDay(ctx, table);
  return today === null || date >= today;
}

export async function dumplingDate(ctx: QueryCtx, dumpling: Doc<"dumplings">) {
  if (dumpling.date) return dumpling.date;
  const filling = dumpling.fillingId ? await ctx.db.get("fillings", dumpling.fillingId) : null;
  return filling?.date ?? null;
}

export async function foldedOn(ctx: QueryCtx, memberId: Id<"members">, date: string) {
  const mine = await ctx.db
    .query("dumplings")
    .withIndex("by_memberId_and_date", (q) => q.eq("memberId", memberId).eq("date", date))
    .first();
  return mine !== null;
}

export async function canSeeDumpling(
  ctx: QueryCtx,
  member: Doc<"members">,
  dumpling: Doc<"dumplings">,
  options: { inFeast?: boolean; depth?: number } = {},
): Promise<boolean> {
  if (dumpling.tableId !== member.tableId) return false;
  if (dumpling.hiddenFrom?.includes(member._id)) return false;
  if (dumpling.sealed && !options.inFeast) return false;
  if (dumpling.replyTo) {
    const depth = options.depth ?? 0;
    const parent = await ctx.db.get("dumplings", dumpling.replyTo);
    if (!parent || depth > 5 || !(await canSeeDumpling(ctx, member, parent, { ...options, depth: depth + 1 }))) return false;
  }
  if (dumpling.memberId === member._id) return true;
  const date = await dumplingDate(ctx, dumpling);
  const table = await ctx.db.get("tables", member.tableId);
  if (!date || !table) return false;
  if (!(await isDayOpen(ctx, table, date))) return true;
  return await foldedOn(ctx, member._id, date);
}
