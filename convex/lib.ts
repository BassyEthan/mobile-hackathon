import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export const sessionArgs = { token: v.string(), memberId: v.id("members") };
type Session = { token: string; memberId: Id<"members"> };

export const LANGUAGES = ["en", "es", "zh", "ko", "ja", "vi", "tl", "hi", "fr"];

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

export const SPARK_TYPES = ["show", "tell", "ask", "together", "sealed"] as const;
export type SparkType = (typeof SPARK_TYPES)[number];

export const SAFE_SPARKS: Array<{ text: string; type: SparkType }> = [
  { text: "Show us your hands doing something right now.", type: "show" },
  { text: "Show us the oldest thing within reach.", type: "show" },
  { text: "Show us what's outside your window.", type: "show" },
  { text: "Show us the last thing you cooked or ate.", type: "show" },
  { text: "Show us something sitting on your kitchen counter.", type: "show" },
  { text: "Show us the chair you sit in most.", type: "show" },
  { text: "Show us something small you fixed or made.", type: "show" },
  { text: "Show us the plant or tree nearest to you.", type: "show" },
  { text: "Tell us one sound you can hear right now.", type: "tell" },
  { text: "Tell us what breakfast looked like when you were ten.", type: "tell" },
  { text: "Say a word your grandparents used at dinner.", type: "tell" },
  { text: "Tell us the name of a street you grew up on.", type: "tell" },
  { text: "Tell us what's in your pocket or bag right now.", type: "tell" },
  { text: "Read us one line from something near you.", type: "tell" },
  { text: "Everyone, say good morning the way your family says it.", type: "together" },
  { text: "Everyone, show us the cup closest to you.", type: "together" },
  { text: "Everyone, tap a little rhythm on the nearest table.", type: "together" },
  { text: "Everyone, show us the shoes by your door.", type: "together" },
  { text: "Whisper one small wish for next week. We open it Sunday.", type: "sealed" },
  { text: "Say hello to whoever watches this at Sunday's Feast.", type: "sealed" },
];

export function seatLine(name: string) {
  return `${name}, we saved you a seat.`;
}

export const SPARK_KEYS = ["primary", "alt0", "alt1", "alt2"] as const;

export type Spark = { text: string; type: SparkType; translations?: Record<string, string> };

function hashDate(date: string) {
  return Number(date.replaceAll("-", ""));
}

export function fallbackAlternates(date: string, exclude: Set<string>, primaryType?: string): Spark[] {
  const alternates: Spark[] = [];
  for (const type of ["show", "tell", "together", "sealed"] as const) {
    if (alternates.length === 3 || type === primaryType) continue;
    const pool = SAFE_SPARKS.filter((s) => s.type === type && !exclude.has(s.text));
    if (pool.length > 0) alternates.push(pool[hashDate(date) % pool.length]);
  }
  return alternates;
}

export function fallbackFilling(date: string, recent: Array<{ text: string; type?: string }>) {
  const used = new Set(recent.map((f) => f.text));
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  const wanted: SparkType[] = day === 5 ? ["sealed"] : day === 6 || day === 0 ? ["tell", "together"] : ["show", "tell"];
  const yesterday = recent[0]?.type;
  const types = wanted.filter((t) => t !== yesterday);
  const candidates = SAFE_SPARKS.filter((s) => (types.length > 0 ? types : ["show", "tell", "together"]).includes(s.type) && s.type !== yesterday);
  const fresh = candidates.filter((s) => !used.has(s.text));
  const pool = fresh.length > 0 ? fresh : candidates;
  const primary = pool[hashDate(date) % pool.length];
  return { primary, moreSparks: fallbackAlternates(date, new Set([...used, primary.text]), primary.type) };
}

export function sparksFor(filling: Doc<"fillings">, language: string) {
  const text = filling.text ?? filling.prompt;
  const primary: Spark = { text, type: (filling.type as SparkType | undefined) ?? "tell", translations: filling.translations };
  const alternates = filling.moreSparks ?? fallbackAlternates(filling.date, new Set([text]), undefined).filter((s) => s.type !== "sealed");
  return [primary, ...alternates.slice(0, 3)].map((s, i) => ({
    key: SPARK_KEYS[i],
    english: s.text,
    text: s.translations?.[language] ?? s.text,
    type: s.type,
  }));
}

export function fillingHiddenFrom(filling: Doc<"fillings">, memberId: Id<"members">) {
  return filling.hiddenFrom?.includes(memberId) ?? false;
}

export async function currentDay(ctx: QueryCtx, table: Doc<"tables">) {
  if (table.today) return table.today;
  const latest = await ctx.db
    .query("dumplings")
    .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).gt("date", ""))
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
  if (!options.inFeast && (dumpling.sealed || dumpling.hiddenFrom?.includes(member._id))) return false;
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
