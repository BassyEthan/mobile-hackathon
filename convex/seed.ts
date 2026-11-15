import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { addDays, hashToken, isDate } from "./lib";

export const DEMO_JOIN_CODE = "DUMPLN";

function requireSeedKey(seedKey: string) {
  const expected = process.env.SEED_KEY;
  if (!expected || seedKey !== expected) throw new ConvexError("Seeding is not allowed.");
}

const MEMBERS = [
  { displayName: "Ah Ma", language: "zh", role: "host" as const },
  { displayName: "Wei", language: "en", role: "member" as const },
  { displayName: "Lucía", language: "es", role: "member" as const },
  { displayName: "Ethan", language: "en", role: "member" as const },
  { displayName: "Min-jun", language: "ko", role: "member" as const },
];

const CLIPS: Array<{ member: number; language: string; transcript: string; translation: Record<string, string> }> = [
  {
    member: 0,
    language: "zh",
    transcript: "今天的饺子特别好吃！",
    translation: { en: "Today's dumplings are especially delicious!", es: "¡Los dumplings de hoy están especialmente ricos!", ko: "오늘 만두가 특히 맛있어요!" },
  },
  {
    member: 3,
    language: "en",
    transcript: "Made it to the top of the hill before sunrise.",
    translation: { zh: "日出前爬到了山顶。", es: "Llegué a la cima de la colina antes del amanecer.", ko: "해 뜨기 전에 언덕 꼭대기에 올랐어요." },
  },
  {
    member: 2,
    language: "es",
    transcript: "Mi gato aprendió a abrir la puerta.",
    translation: { en: "My cat learned to open the door.", zh: "我的猫学会开门了。", ko: "우리 고양이가 문 여는 법을 배웠어요." },
  },
  {
    member: 4,
    language: "ko",
    transcript: "비 오는 날엔 라면이지!",
    translation: { en: "Rainy days mean ramyeon!", zh: "下雨天就要吃拉面！", es: "¡Los días de lluvia son para ramen!" },
  },
  {
    member: 1,
    language: "en",
    transcript: "Fixed the leaky faucet. Only two trips to the hardware store.",
    translation: { zh: "修好了漏水的水龙头。只去了两趟五金店。", es: "Arreglé el grifo que goteaba. Solo dos viajes a la ferretería.", ko: "새는 수도꼭지를 고쳤어요. 철물점은 두 번만 갔어요." },
  },
  {
    member: 0,
    language: "zh",
    transcript: "慢慢吃，别着急。",
    translation: { en: "Eat slowly, don't rush.", es: "Come despacio, sin prisa.", ko: "천천히 먹어, 서두르지 마." },
  },
];

const PROMPTS = [
  "What did you eat today that made you smile?",
  "Show us the view from where you are right now.",
  "Teach us one word from your day.",
  "What is something small that went right?",
  "Show us something you made with your hands.",
  "What is a sound you heard today?",
  "What would you cook for the whole table tonight?",
];

const PAST_DAYS: Array<Array<number>> = [
  [1, 4],
  [2, 3],
  [5, 1],
  [0, 2],
  [4, 3],
  [5, 2],
];

export const demo = mutation({
  args: { seedKey: v.string(), today: v.string(), clips: v.array(v.id("_storage")) },
  returns: v.object({ joinCode: v.string(), tableId: v.id("tables") }),
  handler: async (ctx, args) => {
    requireSeedKey(args.seedKey);
    if (!isDate(args.today) || args.clips.length !== CLIPS.length) throw new Error("Seed needs today and six clips.");
    const old = await ctx.db.query("tables").withIndex("by_joinCode", (q) => q.eq("joinCode", DEMO_JOIN_CODE)).unique();
    if (old) {
      for (const feast of await ctx.db.query("feasts").withIndex("by_tableId_and_weekOf", (q) => q.eq("tableId", old._id)).take(200)) {
        await ctx.db.delete("feasts", feast._id);
      }
      for (const dumpling of await ctx.db.query("dumplings").withIndex("by_tableId_and_createdAt", (q) => q.eq("tableId", old._id)).take(500)) {
        for (const reaction of await ctx.db.query("reactions").withIndex("by_dumplingId", (q) => q.eq("dumplingId", dumpling._id)).take(500)) {
          await ctx.db.delete("reactions", reaction._id);
        }
        await ctx.db.delete("dumplings", dumpling._id);
      }
      for (const filling of await ctx.db.query("fillings").withIndex("by_tableId_and_date", (q) => q.eq("tableId", old._id)).take(500)) {
        await ctx.db.delete("fillings", filling._id);
      }
      for (const member of await ctx.db.query("members").withIndex("by_tableId", (q) => q.eq("tableId", old._id)).take(500)) {
        await ctx.db.delete("members", member._id);
      }
      await ctx.db.delete("tables", old._id);
    }

    const now = Date.now();
    const tableId = await ctx.db.insert("tables", {
      name: "The Lung Family Table",
      joinCode: DEMO_JOIN_CODE,
      chefName: "Chef Bao",
      timeZone: "America/Los_Angeles",
      createdAt: now - 14 * 86_400_000,
    });
    const memberIds: Id<"members">[] = [];
    for (const m of MEMBERS) {
      memberIds.push(
        await ctx.db.insert("members", { tableId, ...m, tokenHash: await hashToken(`seed-${tableId}-${m.displayName}-${now}`) }),
      );
    }

    const fold = async (fillingId: Id<"fillings">, clipIndex: number, createdAt: number, memberOverride?: number) => {
      const clip = CLIPS[clipIndex];
      return await ctx.db.insert("dumplings", {
        tableId,
        memberId: memberIds[memberOverride ?? clip.member],
        fillingId,
        mediaStorageId: args.clips[clipIndex],
        mediaType: "video",
        transcript: clip.transcript,
        language: clip.language,
        translation: clip.translation,
        createdAt,
      });
    };

    const byClip: Record<number, Id<"dumplings">> = {};
    for (let i = 0; i < PAST_DAYS.length; i++) {
      const offset = i - PAST_DAYS.length;
      const fillingId = await ctx.db.insert("fillings", { tableId, date: addDays(args.today, offset), prompt: PROMPTS[i] });
      for (const [j, clipIndex] of PAST_DAYS[i].entries()) {
        const id = await fold(fillingId, clipIndex, now + offset * 86_400_000 + j * 600_000);
        byClip[clipIndex] = id;
      }
    }
    const todayFilling = await ctx.db.insert("fillings", { tableId, date: args.today, prompt: PROMPTS[6] });
    await fold(todayFilling, 0, now - 3 * 3_600_000);
    await fold(todayFilling, 4, now - 2 * 3_600_000);
    await fold(todayFilling, 2, now - 3_600_000);

    const reactionPlan: Array<[number, number, string]> = [
      [2, 0, "heart"], [2, 1, "laugh"], [2, 3, "laugh"], [2, 4, "wow"],
      [1, 0, "heart"], [1, 2, "wow"], [3, 1, "laugh"], [4, 0, "heart"], [5, 3, "heart"], [5, 2, "heart"],
    ];
    for (const [clipIndex, memberIndex, kind] of reactionPlan) {
      await ctx.db.insert("reactions", { dumplingId: byClip[clipIndex], memberId: memberIds[memberIndex], kind, createdAt: now });
    }

    const day = new Date(`${args.today}T12:00:00Z`).getUTCDay();
    const sunday = addDays(args.today, -day);
    await ctx.db.insert("feasts", {
      tableId,
      weekOf: addDays(sunday, -7),
      title: "Leftovers: The Week of Small Wins",
      status: "ready",
      segments: [
        { type: "hostLine", text: "Welcome back to the table. Last week was quiet, which in this family counts as news." },
        { type: "clip", dumplingId: byClip[4] },
        { type: "award", award: "Golden Dumpling", memberName: "Wei", text: "For fixing a faucet with only two trips to the store.", dumplingId: byClip[4] },
        { type: "secretIngredient", prompt: PROMPTS[0], text: "Next week's first Filling. Bring an appetite." },
      ],
      secretIngredient: PROMPTS[0],
      createdAt: now - 7 * 86_400_000,
    });
    await ctx.db.insert("feasts", {
      tableId,
      weekOf: sunday,
      title: "Sunday Feast: Hills, Cats and Noodles",
      status: "ready",
      segments: [
        { type: "hostLine", text: "Welcome to the Lung Family Table, where the dumplings are small and the opinions are large." },
        { type: "titleCard", title: "Last Week", subtitle: "Wei fixed the faucet. It has not dripped since. We checked." },
        { type: "hostLine", text: "First up, a hill, a sunrise, and Ethan pretending it was easy." },
        { type: "clip", dumplingId: byClip[1] },
        { type: "clip", dumplingId: byClip[2] },
        { type: "hostLine", text: "Min-jun has strong opinions about weather and noodles, and both are correct." },
        { type: "clip", dumplingId: byClip[3] },
        { type: "clip", dumplingId: byClip[4] },
        { type: "titleCard", title: "Mother Tongue", phrase: "慢慢吃，别着急。", romanization: "Màn man chī, bié zháojí.", meaning: "Eat slowly, don't rush." },
        { type: "clip", dumplingId: byClip[5] },
        { type: "award", award: "Golden Dumpling", memberName: "Lucía", text: "For a cat with more ambition than most of us.", dumplingId: byClip[2] },
        { type: "award", award: "Empty Plate", memberName: "Min-jun", text: "One dumpling this week. We saved you a seat." },
        { type: "secretIngredient", prompt: "Show us the oldest thing in your kitchen.", text: "Next week's first Filling. Dig deep." },
      ],
      secretIngredient: "Show us the oldest thing in your kitchen.",
      createdAt: now - 3_600_000,
    });
    return { joinCode: DEMO_JOIN_CODE, tableId };
  },
});

export const uploadUrl = mutation({
  args: { seedKey: v.string() },
  returns: v.string(),
  handler: async (ctx, args) => {
    requireSeedKey(args.seedKey);
    return await ctx.storage.generateUploadUrl();
  },
});
