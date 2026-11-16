import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { markToday } from "./schedule";
import {
  LANGUAGES,
  avatarUrlFor,
  dateInZone,
  fallbackAlternates,
  findMember,
  foldedOn,
  hashToken,
  isDate,
  randomString,
  requireMember,
  sessionArgs,
  tableMembers,
} from "./lib";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const TOKEN_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function cleanName(name: string, label: string) {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 40) throw new ConvexError(`${label} needs 1 to 40 characters.`);
  return trimmed;
}

function cleanOptionalName(name: string | undefined) {
  const trimmed = name?.trim() ?? "";
  if (trimmed.length > 40) throw new ConvexError("Nicknames need 40 characters or fewer.");
  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanLanguage(language: string) {
  if (!LANGUAGES.includes(language)) throw new ConvexError("Pick one of the listed languages.");
  return language;
}

function cleanLanguages(languages: string[] | undefined) {
  if (!languages) return undefined;
  return [...new Set(languages.filter((l) => LANGUAGES.includes(l)))].slice(0, 12);
}

const FEAST_HOUR_CHOICES = [10, 15, 18];
function cleanFeastHour(hour: number | undefined) {
  if (hour === undefined) return undefined;
  if (!FEAST_HOUR_CHOICES.includes(hour)) throw new ConvexError("Pick morning, afternoon or evening.");
  return hour;
}

/** The first spark echoes what the host misses most, so the very first Fold already means something. */
export const FIRST_SPARKS: Record<string, { text: string; type: "show" | "tell" | "together" }> = {
  voices: { text: "Everyone, say good morning the way your family says it.", type: "together" },
  food: { text: "Show us the last thing you cooked or ate.", type: "show" },
  jokes: { text: "Tell us the last thing that made you laugh out loud.", type: "tell" },
  knowing: { text: "Show us what's outside your window.", type: "show" },
};

async function seat(
  ctx: MutationCtx,
  tableId: Id<"tables">,
  fields: Omit<Doc<"members">, "_id" | "_creationTime" | "tableId" | "tokenHash">,
) {
  const token = randomString(40, TOKEN_ALPHABET);
  const memberId = await ctx.db.insert("members", { tableId, ...fields, tokenHash: await hashToken(token) });
  return { token, memberId };
}

const intakeValidator = v.object({
  who: v.array(v.string()),
  distance: v.optional(v.string()),
  lastTogether: v.optional(v.string()),
  missMost: v.optional(v.string()),
});

export const create = mutation({
  args: {
    tableName: v.string(),
    displayName: v.string(),
    nickname: v.optional(v.string()),
    language: v.string(),
    motherTongue: v.optional(v.string()),
    wishLanguage: v.optional(v.string()),
    languages: v.optional(v.array(v.string())),
    timeZone: v.string(),
    feastHour: v.optional(v.number()),
    intake: v.optional(intakeValidator),
  },
  returns: v.object({ token: v.string(), memberId: v.id("members"), joinCode: v.string() }),
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
    const now = Date.now();
    const languages = cleanLanguages([language, ...(args.languages ?? [])]);
    const feastHour = cleanFeastHour(args.feastHour);
    const intake = args.intake
      ? {
          who: args.intake.who.slice(0, 8).map((w) => w.slice(0, 30)),
          ...(args.intake.distance ? { distance: args.intake.distance.slice(0, 30) } : {}),
          ...(args.intake.lastTogether ? { lastTogether: args.intake.lastTogether.slice(0, 30) } : {}),
          ...(args.intake.missMost ? { missMost: args.intake.missMost.slice(0, 30) } : {}),
        }
      : undefined;
    const tableId = await ctx.db.insert("tables", {
      name,
      joinCode,
      chefName: "Chef Bao",
      timeZone,
      createdAt: now,
      ...(languages ? { languages } : {}),
      ...(feastHour !== undefined ? { feastHour } : {}),
      ...(intake ? { intake } : {}),
    });
    const seated = await seat(ctx, tableId, {
      displayName,
      language,
      role: "host",
      ...(cleanOptionalName(args.nickname) ? { nickname: cleanOptionalName(args.nickname) } : {}),
      ...(args.motherTongue && LANGUAGES.includes(args.motherTongue) ? { motherTongue: args.motherTongue } : {}),
      ...(args.wishLanguage && LANGUAGES.includes(args.wishLanguage) ? { wishLanguage: args.wishLanguage } : {}),
      ...(args.languages ? { spokenLanguages: cleanLanguages(args.languages) } : {}),
      ...(intake?.missMost ? { missMost: intake.missMost } : {}),
    });

    // Lay today's first spark from the host's own answer to "What do you miss most?". Without one, the usual daily
    // Filling is laid the first time Today opens.
    const first = FIRST_SPARKS[intake?.missMost ?? ""];
    const table = await ctx.db.get("tables", tableId);
    if (table && first) {
      const date = await markToday(ctx, table, now);
      await ctx.db.insert("fillings", {
        tableId,
        date,
        prompt: first.text,
        text: first.text,
        type: first.type,
        moreSparks: fallbackAlternates(date, new Set([first.text]), first.type).map((s) => ({
          text: s.text,
          type: s.type as "show" | "tell" | "together" | "sealed",
        })),
        source: "fallback",
      });
    }
    return { ...seated, joinCode };
  },
});

export const join = mutation({
  args: {
    joinCode: v.string(),
    displayName: v.string(),
    nickname: v.optional(v.string()),
    language: v.string(),
    motherTongue: v.optional(v.string()),
    invitedBy: v.optional(v.string()),
  },
  returns: v.object({ token: v.string(), memberId: v.id("members") }),
  handler: async (ctx, args) => {
    const joinCode = args.joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(joinCode)) throw new ConvexError("Join codes are six letters or numbers.");
    const table = await ctx.db.query("tables").withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode)).unique();
    if (!table) throw new ConvexError("No Table has that code. Check the six characters and try again.");
    const inviterId = args.invitedBy ? ctx.db.normalizeId("members", args.invitedBy) : null;
    const inviter = inviterId ? await ctx.db.get("members", inviterId) : null;
    const language = cleanLanguage(args.language);
    const languages = cleanLanguages([...(table.languages ?? []), language]);
    if (languages) await ctx.db.patch("tables", table._id, { languages });
    return await seat(ctx, table._id, {
      displayName: cleanName(args.displayName, "Your name"),
      language,
      role: "member",
      ...(cleanOptionalName(args.nickname) ? { nickname: cleanOptionalName(args.nickname) } : {}),
      ...(args.motherTongue && LANGUAGES.includes(args.motherTongue) ? { motherTongue: args.motherTongue } : {}),
      ...(inviter && inviter.tableId === table._id ? { invitedBy: inviter._id } : {}),
    });
  },
});

/** What an invite link shows before someone joins: the Table, who invited them, who is already there. */
export const preview = query({
  args: { joinCode: v.string(), invitedBy: v.optional(v.string()) },
  returns: v.union(
    v.null(),
    v.object({ tableName: v.string(), inviterName: v.union(v.string(), v.null()), members: v.array(v.string()) }),
  ),
  handler: async (ctx, args) => {
    const joinCode = args.joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(joinCode)) return null;
    const table = await ctx.db.query("tables").withIndex("by_joinCode", (q) => q.eq("joinCode", joinCode)).unique();
    if (!table) return null;
    const members = await tableMembers(ctx, table._id);
    const inviterId = args.invitedBy ? ctx.db.normalizeId("members", args.invitedBy) : null;
    const inviter = members.find((m) => m._id === inviterId) ?? members.find((m) => m.role === "host") ?? null;
    return { tableName: table.name, inviterName: inviter?.displayName ?? null, members: members.map((m) => m.displayName).slice(0, 12) };
  },
});

const meValidator = v.object({
  memberId: v.id("members"),
  displayName: v.string(),
  nickname: v.union(v.string(), v.null()),
  language: v.string(),
  motherTongue: v.union(v.string(), v.null()),
  wishLanguage: v.union(v.string(), v.null()),
  spokenLanguages: v.array(v.string()),
  birthday: v.union(v.object({ month: v.number(), day: v.number() }), v.null()),
  missMost: v.union(v.string(), v.null()),
  sundayTime: v.union(v.string(), v.null()),
  prompted: v.array(v.string()),
  role: v.union(v.literal("host"), v.literal("member"), v.literal("guest")),
  isElder: v.boolean(),
  voiceOnly: v.boolean(),
  notifyFrom: v.number(),
  hasPushToken: v.boolean(),
  joinedAt: v.number(),
  tableName: v.string(),
  chefName: v.string(),
  joinCode: v.string(),
  timeZone: v.string(),
  feastHour: v.number(),
  tableLanguages: v.array(v.string()),
  avatarUrl: v.union(v.string(), v.null()),
});

export const me = query({
  args: sessionArgs,
  returns: v.union(v.null(), meValidator),
  handler: async (ctx, args) => {
    const session = await findMember(ctx, args);
    if (!session) return null;
    const { member, table } = session;
    return {
      memberId: member._id,
      displayName: member.displayName,
      nickname: member.nickname ?? null,
      language: member.language,
      motherTongue: member.motherTongue ?? null,
      wishLanguage: member.wishLanguage ?? null,
      spokenLanguages: member.spokenLanguages ?? [member.motherTongue ?? member.language],
      birthday: member.birthday ?? null,
      missMost: member.missMost ?? null,
      sundayTime: member.sundayTime ?? null,
      prompted: member.prompted ?? [],
      role: member.role,
      isElder: member.isElder ?? false,
      voiceOnly: member.voiceOnly ?? false,
      notifyFrom: member.notifyFrom ?? 8,
      hasPushToken: !!member.pushToken,
      joinedAt: member._creationTime,
      tableName: table.name,
      chefName: table.chefName,
      joinCode: table.joinCode,
      timeZone: table.timeZone,
      feastHour: table.feastHour ?? 18,
      tableLanguages: table.languages ?? [member.language],
      avatarUrl: await avatarUrlFor(ctx, member),
    };
  },
});

/** The most recent recurring segment the Chef has named for each member. */
export async function segmentsByMember(ctx: QueryCtx, tableId: Id<"tables">) {
  const recent = await ctx.db
    .query("fillings")
    .withIndex("by_tableId_and_date", (q) => q.eq("tableId", tableId))
    .order("desc")
    .take(90);
  const segments = new Map<Id<"members">, string>();
  for (const f of recent) {
    if (f.segmentIdea && !segments.has(f.segmentIdea.memberId)) segments.set(f.segmentIdea.memberId, f.segmentIdea.title);
  }
  return segments;
}

export const seats = query({
  args: { ...sessionArgs, date: v.string() },
  returns: v.array(
    v.object({
      id: v.id("members"),
      displayName: v.string(),
      nickname: v.union(v.string(), v.null()),
      avatarUrl: v.union(v.string(), v.null()),
      languages: v.array(v.string()),
      role: v.union(v.literal("host"), v.literal("member"), v.literal("guest")),
      isElder: v.boolean(),
      isMe: v.boolean(),
      foldedToday: v.boolean(),
      segment: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const date = isDate(args.date) ? args.date : dateInZone(table.createdAt, table.timeZone);
    const members = await tableMembers(ctx, table._id, { guests: true });
    const segments = await segmentsByMember(ctx, table._id);
    const rows = [];
    for (const m of members) {
      rows.push({
        id: m._id,
        displayName: m.displayName,
        nickname: m.nickname ?? null,
        avatarUrl: await avatarUrlFor(ctx, m),
        languages: m.spokenLanguages ?? [m.motherTongue ?? m.language],
        role: m.role,
        isElder: m.isElder ?? false,
        isMe: m._id === member._id,
        foldedToday: m.role !== "guest" && (await foldedOn(ctx, m._id, date)),
        segment: segments.get(m._id) ?? null,
      });
    }
    return rows;
  },
});

export const updateProfile = mutation({
  args: {
    ...sessionArgs,
    displayName: v.optional(v.string()),
    nickname: v.optional(v.string()),
    language: v.optional(v.string()),
    motherTongue: v.optional(v.string()),
    wishLanguage: v.optional(v.string()),
    spokenLanguages: v.optional(v.array(v.string())),
    birthday: v.optional(v.union(v.object({ month: v.number(), day: v.number() }), v.null())),
    missMost: v.optional(v.string()),
    sundayTime: v.optional(v.string()),
    voiceOnly: v.optional(v.boolean()),
    notifyFrom: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const patch: Partial<Doc<"members">> = {};
    if (args.displayName !== undefined) patch.displayName = cleanName(args.displayName, "Your name");
    if (args.nickname !== undefined) patch.nickname = cleanOptionalName(args.nickname);
    if (args.language !== undefined) {
      patch.language = cleanLanguage(args.language);
      const languages = cleanLanguages([...(table.languages ?? []), patch.language]);
      if (languages) await ctx.db.patch("tables", table._id, { languages });
    }
    if (args.motherTongue !== undefined) patch.motherTongue = cleanLanguage(args.motherTongue);
    if (args.wishLanguage !== undefined) patch.wishLanguage = args.wishLanguage === "" ? undefined : cleanLanguage(args.wishLanguage);
    if (args.spokenLanguages !== undefined) patch.spokenLanguages = cleanLanguages(args.spokenLanguages);
    if (args.birthday !== undefined) {
      if (args.birthday === null) patch.birthday = undefined;
      else {
        const { month, day } = args.birthday;
        if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1 || day > 31) {
          throw new ConvexError("That birthday does not look right.");
        }
        patch.birthday = { month, day };
      }
    }
    if (args.missMost !== undefined) patch.missMost = args.missMost.slice(0, 30);
    if (args.sundayTime !== undefined) patch.sundayTime = args.sundayTime.slice(0, 30);
    if (args.voiceOnly !== undefined) patch.voiceOnly = args.voiceOnly;
    if (args.notifyFrom !== undefined) {
      if (!Number.isInteger(args.notifyFrom) || args.notifyFrom < 5 || args.notifyFrom > 12) throw new ConvexError("Pick a morning hour.");
      patch.notifyFrom = args.notifyFrom;
    }
    await ctx.db.patch("members", member._id, patch);
    return null;
  },
});

/** A reflective Today card was answered or dismissed; never show it again. */
export const promptDone = mutation({
  args: { ...sessionArgs, key: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args);
    const prompted = new Set(member.prompted ?? []);
    prompted.add(args.key.slice(0, 30));
    await ctx.db.patch("members", member._id, { prompted: [...prompted].slice(0, 20) });
    return null;
  },
});

export const savePushToken = mutation({
  args: { ...sessionArgs, pushToken: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args);
    if (args.pushToken !== null && !/^Expo(nent)?PushToken\[.+\]$/.test(args.pushToken)) throw new ConvexError("That is not a push token.");
    await ctx.db.patch("members", member._id, { pushToken: args.pushToken ?? undefined });
    return null;
  },
});

async function requireHost(ctx: QueryCtx, args: { token: string; memberId: Id<"members"> }) {
  const session = await requireMember(ctx, args);
  if (session.member.role !== "host") throw new ConvexError("Only the host can change this.");
  return session;
}

export const updateTable = mutation({
  args: { ...sessionArgs, name: v.optional(v.string()), feastHour: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { table } = await requireHost(ctx, args);
    await ctx.db.patch("tables", table._id, {
      ...(args.name !== undefined ? { name: cleanName(args.name, "Table name") } : {}),
      ...(args.feastHour !== undefined ? { feastHour: cleanFeastHour(args.feastHour) } : {}),
    });
    return null;
  },
});

/** Elder mode is switched on by the host for a member: larger text, the spark read aloud, one record button. */
export const setElder = mutation({
  args: { ...sessionArgs, targetId: v.id("members"), isElder: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { table } = await requireHost(ctx, args);
    const target = await ctx.db.get("members", args.targetId);
    if (!target || target.tableId !== table._id || target.leftAt) throw new ConvexError("Pick someone at this Table.");
    await ctx.db.patch("members", target._id, { isElder: args.isElder });
    return null;
  },
});

/** A grandparent who will not install the app gets a seat that only watches the Feast by link. */
export const addGuest = mutation({
  args: { ...sessionArgs, displayName: v.string(), phone: v.string() },
  returns: v.object({ token: v.string(), memberId: v.id("members") }),
  handler: async (ctx, args) => {
    const { member, table } = await requireMember(ctx, args);
    const phone = args.phone.replace(/[^\d+]/g, "");
    if (phone.replace(/\D/g, "").length < 7 || phone.length > 16) throw new ConvexError("Enter a full phone number.");
    return await seat(ctx, table._id, {
      displayName: cleanName(args.displayName, "Their name"),
      language: member.language,
      role: "guest",
      phone,
      invitedBy: member._id,
    });
  },
});

async function handOverHost(ctx: MutationCtx, member: Doc<"members">) {
  if (member.role !== "host") return;
  const next = (await tableMembers(ctx, member.tableId)).find((m) => m._id !== member._id);
  if (next) await ctx.db.patch("members", next._id, { role: "host" });
}

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Sets (or with `storageId: null`, removes) your profile picture. The file is uploaded first through
 * dumplings.generateUploadUrl; it must be an image of at most 5 MB. The previous picture is deleted.
 */
export const setAvatar = mutation({
  args: { ...sessionArgs, storageId: v.union(v.id("_storage"), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args);
    if (args.storageId) {
      const file = await ctx.db.system.get("_storage", args.storageId);
      if (!file) throw new ConvexError("That picture did not upload. Try again.");
      if (!file.contentType?.startsWith("image/") || file.size > AVATAR_MAX_BYTES) {
        await ctx.storage.delete(args.storageId);
        throw new ConvexError("Pick a photo under 5 MB.");
      }
    }
    if (member.avatarStorageId && member.avatarStorageId !== args.storageId) await ctx.storage.delete(member.avatarStorageId);
    await ctx.db.patch("members", member._id, { avatarStorageId: args.storageId ?? undefined });
    return null;
  },
});

/** Leaving keeps your past clips in the family's Feasts but gives up your seat. */
export const leave = mutation({
  args: sessionArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args);
    await handOverHost(ctx, member);
    await ctx.db.patch("members", member._id, {
      leftAt: Date.now(),
      pushToken: undefined,
      tokenHash: await hashToken(randomString(40, TOKEN_ALPHABET)),
    });
    return null;
  },
});

/** Deleting removes your seat and everything you recorded. */
export const deleteAccount = mutation({
  args: sessionArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireMember(ctx, args);
    await handOverHost(ctx, member);
    for await (const d of ctx.db.query("dumplings").withIndex("by_memberId_and_createdAt", (q) => q.eq("memberId", member._id))) {
      for await (const r of ctx.db.query("reactions").withIndex("by_dumplingId", (q) => q.eq("dumplingId", d._id))) {
        if (r.audioStorageId) await ctx.storage.delete(r.audioStorageId);
        await ctx.db.delete("reactions", r._id);
      }
      for await (const child of ctx.db.query("dumplings").withIndex("by_replyTo", (q) => q.eq("replyTo", d._id))) {
        await ctx.db.patch("dumplings", child._id, { replyTo: undefined });
      }
      await ctx.storage.delete(d.mediaStorageId);
      await ctx.db.delete("dumplings", d._id);
    }
    for await (const a of ctx.db.query("phraseAttempts").withIndex("by_memberId_and_createdAt", (q) => q.eq("memberId", member._id))) {
      await ctx.storage.delete(a.storageId);
      await ctx.db.delete("phraseAttempts", a._id);
    }
    for await (const n of ctx.db.query("notifications").withIndex("by_memberId_and_date", (q) => q.eq("memberId", member._id))) {
      await ctx.db.delete("notifications", n._id);
    }
    for await (const r of ctx.db.query("reactions").withIndex("by_memberId", (q) => q.eq("memberId", member._id))) {
      if (r.audioStorageId) await ctx.storage.delete(r.audioStorageId);
      await ctx.db.delete("reactions", r._id);
    }
    if (member.avatarStorageId) await ctx.storage.delete(member.avatarStorageId);
    await ctx.db.delete("members", member._id);
    return null;
  },
});
