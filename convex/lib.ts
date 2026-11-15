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

export async function isFillingOpen(ctx: QueryCtx, filling: Doc<"fillings">) {
  const later = await ctx.db
    .query("fillings")
    .withIndex("by_tableId_and_date", (q) => q.eq("tableId", filling.tableId).gt("date", filling.date))
    .first();
  return later === null;
}

export async function hasFolded(ctx: QueryCtx, member: Doc<"members">, fillingId: Doc<"fillings">["_id"]) {
  const mine = await ctx.db
    .query("dumplings")
    .withIndex("by_fillingId_and_memberId", (q) => q.eq("fillingId", fillingId).eq("memberId", member._id))
    .first();
  return mine !== null;
}

export async function canSeeDumpling(ctx: QueryCtx, member: Doc<"members">, dumpling: Doc<"dumplings">) {
  if (dumpling.tableId !== member.tableId) return false;
  const filling = await ctx.db.get("fillings", dumpling.fillingId);
  if (!filling) return false;
  if (!(await isFillingOpen(ctx, filling))) return true;
  const members = await ctx.db.query("members")
    .withIndex("by_tableId", (q) => q.eq("tableId", member.tableId)).take(2);
  return members.length > 1 && (
    dumpling.memberId === member._id || await hasFolded(ctx, member, dumpling.fillingId)
  );
}
