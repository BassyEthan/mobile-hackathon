import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const segment = v.union(
  v.object({
    type: v.literal("hostLine"),
    text: v.string(),
    translations: v.optional(v.record(v.string(), v.string())),
    audioStorageId: v.optional(v.id("_storage")),
  }),
  v.object({
    type: v.literal("clip"),
    dumplingId: v.id("dumplings"),
  }),
  v.object({
    type: v.literal("titleCard"),
    title: v.string(),
    subtitle: v.optional(v.string()),
    phrase: v.optional(v.string()),
    romanization: v.optional(v.string()),
    meaning: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("award"),
    award: v.string(),
    memberName: v.string(),
    text: v.string(),
    translations: v.optional(v.record(v.string(), v.string())),
    dumplingId: v.optional(v.id("dumplings")),
  }),
  v.object({
    type: v.literal("secretIngredient"),
    prompt: v.string(),
    text: v.string(),
    translations: v.optional(v.record(v.string(), v.string())),
  }),
);

export default defineSchema({
  connectionChecks: defineTable({
    source: v.string(),
  }),
  tables: defineTable({
    name: v.string(),
    joinCode: v.string(),
    chefName: v.string(),
    timeZone: v.string(),
    createdAt: v.number(),
    today: v.optional(v.string()),
    // Local hour on Sunday when the Feast is served (set during host onboarding).
    feastHour: v.optional(v.number()),
    // Languages the family speaks, used for captions.
    languages: v.optional(v.array(v.string())),
    intake: v.optional(
      v.object({
        who: v.array(v.string()),
        distance: v.optional(v.string()),
        lastTogether: v.optional(v.string()),
        missMost: v.optional(v.string()),
      }),
    ),
  }).index("by_joinCode", ["joinCode"]),
  members: defineTable({
    tableId: v.id("tables"),
    displayName: v.string(),
    language: v.string(),
    role: v.union(v.literal("host"), v.literal("member"), v.literal("guest")),
    tokenHash: v.string(),
    birthday: v.optional(v.object({ month: v.number(), day: v.number() })),
    isElder: v.optional(v.boolean()),
    nickname: v.optional(v.string()),
    motherTongue: v.optional(v.string()),
    wishLanguage: v.optional(v.string()),
    spokenLanguages: v.optional(v.array(v.string())),
    missMost: v.optional(v.string()),
    sundayTime: v.optional(v.string()),
    // Reflective Today cards the member answered or dismissed.
    prompted: v.optional(v.array(v.string())),
    voiceOnly: v.optional(v.boolean()),
    // Earliest local hour a notification may arrive.
    notifyFrom: v.optional(v.number()),
    pushToken: v.optional(v.string()),
    phone: v.optional(v.string()),
    invitedBy: v.optional(v.id("members")),
    leftAt: v.optional(v.number()),
  })
    .index("by_tableId", ["tableId"])
    .index("by_tokenHash", ["tokenHash"]),
  fillings: defineTable({
    tableId: v.id("tables"),
    date: v.string(),
    prompt: v.string(),
    text: v.optional(v.string()),
    type: v.optional(v.union(v.literal("show"), v.literal("tell"), v.literal("ask"), v.literal("together"), v.literal("sealed"))),
    authorId: v.optional(v.id("members")),
    addressedTo: v.optional(v.id("members")),
    hiddenFrom: v.optional(v.array(v.id("members"))),
    translations: v.optional(v.record(v.string(), v.string())),
    spokenVersion: v.optional(v.string()),
    moreSparks: v.optional(
      v.array(
        v.object({
          text: v.string(),
          type: v.union(v.literal("show"), v.literal("tell"), v.literal("together"), v.literal("sealed")),
          translations: v.optional(v.record(v.string(), v.string())),
        }),
      ),
    ),
    reason: v.optional(v.string()),
    segmentIdea: v.optional(v.object({ memberId: v.id("members"), title: v.string() })),
    askId: v.optional(v.id("askQueue")),
    source: v.optional(v.union(v.literal("ai"), v.literal("fallback"), v.literal("secretIngredient"))),
  }).index("by_tableId_and_date", ["tableId", "date"]),
  dumplings: defineTable({
    tableId: v.id("tables"),
    memberId: v.id("members"),
    fillingId: v.optional(v.id("fillings")),
    date: v.optional(v.string()),
    answeredSpark: v.optional(v.boolean()),
    sparkKey: v.optional(v.string()),
    sparkText: v.optional(v.string()),
    replyTo: v.optional(v.id("dumplings")),
    sealed: v.optional(v.boolean()),
    hiddenFrom: v.optional(v.array(v.id("members"))),
    mediaStorageId: v.id("_storage"),
    mediaType: v.union(v.literal("video"), v.literal("audio")),
    transcript: v.optional(v.string()),
    language: v.optional(v.string()),
    translation: v.optional(v.record(v.string(), v.string())),
    allowShare: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_fillingId_and_memberId", ["fillingId", "memberId"])
    .index("by_tableId_and_createdAt", ["tableId", "createdAt"])
    .index("by_tableId_and_date", ["tableId", "date"])
    .index("by_memberId_and_date", ["memberId", "date"])
    .index("by_replyTo", ["replyTo"])
    .index("by_memberId_and_createdAt", ["memberId", "createdAt"]),
  askQueue: defineTable({
    tableId: v.id("tables"),
    authorId: v.id("members"),
    text: v.string(),
    addressedTo: v.optional(v.id("members")),
    weekOf: v.string(),
    createdAt: v.number(),
    usedOn: v.optional(v.string()),
  })
    .index("by_authorId_and_weekOf", ["authorId", "weekOf"])
    .index("by_tableId_and_usedOn", ["tableId", "usedOn"]),
  reactions: defineTable({
    dumplingId: v.id("dumplings"),
    memberId: v.id("members"),
    kind: v.string(),
    audioStorageId: v.optional(v.id("_storage")),
    createdAt: v.number(),
  })
    .index("by_dumplingId", ["dumplingId"])
    .index("by_memberId", ["memberId"]),
  feasts: defineTable({
    tableId: v.id("tables"),
    weekOf: v.string(),
    title: v.string(),
    status: v.union(v.literal("cooking"), v.literal("ready"), v.literal("failed")),
    segments: v.array(segment),
    error: v.optional(v.string()),
    secretIngredient: v.optional(v.string()),
    nextFillingId: v.optional(v.id("fillings")),
    kind: v.optional(v.union(v.literal("weekly"), v.literal("banquet"), v.literal("reunion"))),
    createdAt: v.number(),
  }).index("by_tableId_and_weekOf", ["tableId", "weekOf"]),
  phraseAttempts: defineTable({
    memberId: v.id("members"),
    feastId: v.id("feasts"),
    phrase: v.string(),
    meaning: v.optional(v.string()),
    storageId: v.id("_storage"),
    createdAt: v.number(),
  }).index("by_memberId_and_createdAt", ["memberId", "createdAt"]),
  notifications: defineTable({
    memberId: v.id("members"),
    date: v.string(),
    kind: v.string(),
    createdAt: v.number(),
  }).index("by_memberId_and_date", ["memberId", "date"]),
});
