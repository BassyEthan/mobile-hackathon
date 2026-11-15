import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { LANGUAGES, findMember, hashToken, randomString } from "./lib";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function cleanName(name: string, label: string) {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) throw new ConvexError(`${label} needs 1 to 40 characters.`);
  return trimmed;
}

function cleanLanguage(language: string) {
  if (!LANGUAGES.includes(language)) throw new ConvexError("Pick one of the listed languages.");
  return language;
}

async function seat(ctx: MutationCtx, tableId: Id<"tables">, displayName: string, language: string, role: "host" | "member") {
  const token = randomString(40, TOKEN_ALPHABET);
  await ctx.db.insert("members", {
    tableId,
    displayName,
    language,
    role,
    tokenHash: await hashToken(token),
  });
  return token;
}

export const create = mutation({
  args: { tableName: v.string(), displayName: v.string(), language: v.string(), timeZone: v.string() },
  returns: v.object({ token: v.string(), joinCode: v.string() }),
  handler: async (ctx, args) => {
    const name = cleanName(args.tableName, "Table name");
    const displayName = cleanName(args.displayName, "Your name");
    const language = cleanLanguage(args.language);
    let timeZone = "America/Los_Angeles";
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: args.timeZone });
      timeZone = args.timeZone;
    } catch {}
    let joinCode = randomString(6, CODE_ALPHABET);
    while (await ctx.db.query("tables").withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode)).first()) {
      joinCode = randomString(6, CODE_ALPHABET);
    }
    const tableId = await ctx.db.insert("tables", {
      name,
      joinCode,
      chefName: "Chef Bao",
      timeZone,
      createdAt: Date.now(),
    });
    return { token: await seat(ctx, tableId, displayName, language, "host"), joinCode };
  },
});

export const join = mutation({
  args: { joinCode: v.string(), displayName: v.string(), language: v.string() },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const joinCode = args.joinCode.trim().toUpperCase();
    const table = await ctx.db.query("tables").withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode)).unique();
    if (!table) throw new ConvexError("No Table has that code. Check the six characters and try again.");
    const token = await seat(ctx, table._id, cleanName(args.displayName, "Your name"), cleanLanguage(args.language), "member");
    return { token };
  },
});

export const me = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      memberId: v.id("members"),
      displayName: v.string(),
      language: v.string(),
      tableName: v.string(),
      chefName: v.string(),
      joinCode: v.string(),
      timeZone: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const session = await findMember(ctx, args.token);
    if (!session) return null;
    const { member, table } = session;
    return {
      memberId: member._id,
      displayName: member.displayName,
      language: member.language,
      tableName: table.name,
      chefName: table.chefName,
      joinCode: table.joinCode,
      timeZone: table.timeZone,
    };
  },
});
