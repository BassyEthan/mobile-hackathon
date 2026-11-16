import { ConvexError, v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { callbacks, openai, outputText } from "./chef";
import { addDays, dateInZone, fallbackFilling, findMember, isDate, localHour, sessionArgs, tableMembers, weekOfFor } from "./lib";
import { pendingSecretIngredient } from "./schedule";

const TEXT_MODEL = "gpt-6.1-terra";
const WINDOW_SPARK = "show us what's outside your window";
const DEMO_JOIN_CODE = "DUMPLN";
const GENERATE_FROM_HOUR = 19;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const SYSTEM_PROMPT = "You write the daily spark for a family using Dumpling. A spark is one small, optional invitation to film a clip of 10 seconds or less. Family members can ignore it and film anything they like, so it has to be something they want to answer. Your goal is clips that are easy to record and meaningful to watch.\n\nTONE\nWrite like a playful friend suggesting something, never like an app assigning work. Never use: must, should, don't forget, task, assignment, required, remember to, today's challenge.\n\nRULES FOR EVERY SPARK\n1. Answerable in 10 seconds, right now, wherever the person is, with no preparation.\n2. Twelve words or fewer. One action. Words a child and a grandparent both understand.\n3. Concrete. Name a thing, a place, a sound or a moment. Never ask for a favorite, an opinion or a summary of the day.\n4. Never require the person to be interesting, funny or good on camera.\n5. Always possible without showing a face. Voice or hands are enough.\n6. Never touch health, money, weight or appearance, grief, politics, religion or relationship status. Nothing that needs spending money or leaving home.\n7. No question answerable with yes, no or one word.\n8. Do not repeat anything in the history, except the monthly repeat in rule 14.\n\nTYPES\nshow: point the camera at something in front of you.\ntell: say something in your own voice.\nask: a question from a family member, taken from the queue.\ntogether: everyone does the same small action.\nsealed: answers stay hidden until the Sunday Feast.\n\nCHOOSING\n9. Across a week aim for 2 show, 2 tell, 1 ask, 1 together, 1 sealed. Never the same type two days running.\n10. Monday to Thursday lean toward show. Friday is sealed. Saturday leans toward tell or together.\n11. Learn from the history. Use less of any type this family answers under half the time, and write more in the spirit of sparks that drew many reactions.\n12. If anyone has gone 3 or more days without posting, choose a spark that is especially easy for them. Never mention their absence.\n13. If an elder is at the Table, once a week write a spark where they are the expert: a word, a song, a recipe step, a memory.\n14. Once a month, use \"Show us what's outside your window\" so the clips form a time lapse.\n15. In the 7 days before a birthday, write one sealed spark asking everyone else for a wish, and list the birthday person in hidden_from.\n16. Use the callbacks to connect to what this family already loves filming.\n\nTHE QUEUE\n17. Use at most 2 queued questions a week, oldest first.\n18. Keep the author's voice. Edit only to meet rules 1 to 8. If a question cannot fit, skip it.\n19. If it is aimed at one person, keep it aimed and name both people.\n\nOUTPUT: JSON ONLY\n{\n  \"text\": the spark in English,\n  \"type\": \"show\" | \"tell\" | \"ask\" | \"together\" | \"sealed\",\n  \"author\": null or a member's name,\n  \"addressed_to\": \"everyone\" or a member's name,\n  \"hidden_from\": [],\n  \"translations\": { language code: text } for every language at the Table,\n  \"spoken_version\": one warm sentence to be read aloud,\n  \"more_sparks\": [ 3 alternates of different types, each with text and translations ],\n  \"segment_idea\": null, or { \"member\": name, \"title\": a short segment name } when one member has posted about the same subject 3 or more times in 3 weeks,\n  \"reason\": one short sentence\n}\n\nGOOD\nShow us your hands doing something right now.\nTell us one sound you can hear.\nSay good morning the way Grandma taught you.\nShow us the oldest thing within reach.\nGrandpa, tell us what breakfast was when you were ten.\n\nBAD\nHow was your day? (vague)\nWhat's your favorite memory? (too big for ten seconds)\nShow us your outfit. (appearance)\nDo you miss home? (yes or no, and may hurt)\nFilm something beautiful. (demands performance)";

const FORMAT_NOTE = `

INPUT AND FORMAT NOTES
The input is JSON describing the Table: members (name, language, role, days since their last post), history (the last 21 sparks, newest first, with type, the share of members who answered and average reactions), queue (unused questions, oldest first; empty when two were already used this week), weekday, birthdays (null when unknown), elders (null when unknown), callbacks from past Feasts, and secretIngredient. If secretIngredient is not null, it is the spark the Chef teased at Sunday's Feast: use it as text, editing only to meet rules 1 to 8, with type show or tell.
The output schema writes every translations object as an array of { "language", "text" } pairs, one per language code in tableLanguages other than "en". For type ask, author is the queued question's author. For every other type, author is null. Use member names exactly as given.`;

const sparkType = v.union(v.literal("show"), v.literal("tell"), v.literal("ask"), v.literal("together"), v.literal("sealed"));
const altType = v.union(v.literal("show"), v.literal("tell"), v.literal("together"), v.literal("sealed"));

const contextValidator = v.object({
  tableId: v.id("tables"),
  date: v.string(),
  weekday: v.string(),
  languages: v.array(v.string()),
  birthdays: v.array(v.object({ name: v.string(), date: v.string() })),
  elders: v.array(v.string()),
  members: v.array(v.object({ id: v.id("members"), name: v.string(), language: v.string(), role: v.string(), daysSincePost: v.union(v.number(), v.null()) })),
  history: v.array(v.object({ date: v.string(), text: v.string(), type: v.union(v.string(), v.null()), answerShare: v.number(), averageReactions: v.number() })),
  queue: v.array(v.object({ id: v.id("askQueue"), authorId: v.id("members"), author: v.string(), addressedTo: v.union(v.string(), v.null()), addressedToId: v.union(v.id("members"), v.null()), text: v.string() })),
  secretIngredient: v.union(v.null(), v.object({ feastId: v.id("feasts"), text: v.string() })),
  existing: v.union(v.null(), v.object({ id: v.id("fillings"), answered: v.boolean() })),
});
type Context = Infer<typeof contextValidator>;

const fillingFields = {
  text: v.string(),
  type: sparkType,
  authorId: v.optional(v.id("members")),
  addressedTo: v.optional(v.id("members")),
  hiddenFrom: v.optional(v.array(v.id("members"))),
  translations: v.optional(v.record(v.string(), v.string())),
  spokenVersion: v.optional(v.string()),
  moreSparks: v.array(v.object({ text: v.string(), type: altType, translations: v.optional(v.record(v.string(), v.string())) })),
  reason: v.optional(v.string()),
  segmentIdea: v.optional(v.object({ memberId: v.id("members"), title: v.string() })),
  askId: v.optional(v.id("askQueue")),
  source: v.union(v.literal("ai"), v.literal("fallback"), v.literal("secretIngredient")),
};
const fillingPayload = v.object(fillingFields);
type Payload = Infer<typeof fillingPayload>;

export const context = internalQuery({
  args: { tableId: v.id("tables"), date: v.string() },
  returns: v.union(v.null(), contextValidator),
  handler: async (ctx, args) => {
    const table = await ctx.db.get("tables", args.tableId);
    if (!table || !isDate(args.date)) return null;
    const members = await tableMembers(ctx, table._id);
    const names = new Map(members.map((m) => [m._id, m.displayName]));
    const days = (from: string) => Math.round((Date.parse(`${args.date}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
    const memberInfo = [];
    for (const m of members) {
      const last = await ctx.db
        .query("dumplings")
        .withIndex("by_memberId_and_date", (q) => q.eq("memberId", m._id).lt("date", args.date))
        .order("desc")
        .first();
      memberInfo.push({ id: m._id, name: m.displayName, language: m.language, role: m.role, daysSincePost: last?.date ? days(last.date) : null });
    }
    const past = await ctx.db
      .query("fillings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).lt("date", args.date))
      .order("desc")
      .take(21);
    const history = [];
    for (const f of past) {
      const answers = await ctx.db
        .query("dumplings")
        .withIndex("by_fillingId_and_memberId", (q) => q.eq("fillingId", f._id))
        .take(100);
      let reactions = 0;
      for (const a of answers) reactions += (await ctx.db.query("reactions").withIndex("by_dumplingId", (q) => q.eq("dumplingId", a._id)).take(100)).length;
      history.push({
        date: f.date,
        text: f.text ?? f.prompt,
        type: f.type ?? null,
        answerShare: members.length ? Math.round((new Set(answers.map((a) => a.memberId)).size / members.length) * 100) / 100 : 0,
        averageReactions: answers.length ? Math.round((reactions / answers.length) * 10) / 10 : 0,
      });
    }
    const weekOf = weekOfFor(args.date);
    const usedThisWeek = await ctx.db
      .query("askQueue")
      .withIndex("by_tableId_and_usedOn", (q) => q.eq("tableId", table._id).gte("usedOn", addDays(weekOf, -6)).lte("usedOn", weekOf))
      .take(2);
    const unused = usedThisWeek.length >= 2
      ? []
      : await ctx.db
          .query("askQueue")
          .withIndex("by_tableId_and_usedOn", (q) => q.eq("tableId", table._id).eq("usedOn", undefined))
          .take(10)
          .then((rows) => rows.filter((a) => !a.answeredBy).slice(0, 5));
    const existing = await ctx.db
      .query("fillings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).eq("date", args.date))
      .unique();
    const answered = existing
      ? (await ctx.db.query("dumplings").withIndex("by_fillingId_and_memberId", (q) => q.eq("fillingId", existing._id)).first()) !== null
      : false;
    const secret = await pendingSecretIngredient(ctx, table._id, args.date);
    const upcomingDates = Array.from({ length: 7 }, (_, offset) => addDays(args.date, offset));
    const birthdays = members.flatMap((member) => {
      if (!member.birthday) return [];
      const { month, day } = member.birthday;
      const monthDay = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const date = upcomingDates.find((candidate) => candidate.slice(5) === monthDay);
      return date ? [{ name: member.displayName, date }] : [];
    });
    return {
      tableId: table._id,
      date: args.date,
      weekday: WEEKDAYS[new Date(`${args.date}T12:00:00Z`).getUTCDay()],
      languages: [...new Set(members.map((m) => m.language))],
      members: memberInfo,
      birthdays,
      elders: members.filter((m) => m.isElder).map((m) => m.displayName),
      history,
      queue: unused.map((q) => ({
        id: q._id,
        authorId: q.authorId,
        author: names.get(q.authorId) ?? "Someone",
        addressedTo: q.addressedTo ? (names.get(q.addressedTo) ?? null) : null,
        addressedToId: q.addressedTo ?? null,
        text: q.text,
      })),
      secretIngredient: secret?.secretIngredient && !existing ? { feastId: secret._id, text: secret.secretIngredient } : null,
      existing: existing ? { id: existing._id, answered } : null,
    };
  },
});

const BANNED = [
  /\bmust\b/i, /\bshould\b/i, /don'?t forget|do not forget/i, /\btasks?\b/i, /\bassignments?\b/i, /\brequired\b/i, /remember to/i,
  /today'?s challenge/i, /\bfavou?rites?\b/i, /\bopinions?\b/i, /how was your (day|week)/i, /\b(health|sick|doctor|hospital|medicine)\b/i,
  /\b(money|price|cost|pay|buy|spend|shop|shopping)\b/i, /\b(weight|diet|outfit|appearance|beautiful|pretty|ugly)\b/i,
  /\b(grief|died|death|funeral|miss)\b/i, /\b(politics?|political|election|vote)\b/i, /\b(religion|religious|church|pray|prayer|god)\b/i,
  /\b(dating|boyfriend|girlfriend|married|divorce|single)\b/i, /\b(go|head) out\b/i, /\bleave (home|the house)\b/i,
];
const YES_NO = /^(do|does|did|are|is|was|were|have|has|had|can|could|will|would|shall)\b/i;

function checkSparkText(text: unknown, label: string) {
  if (typeof text !== "string" || !text.trim()) throw new Error(`${label} is empty`);
  const clean = text.trim();
  if (clean.split(/\s+/).length > 12) throw new Error(`${label} has more than twelve words`);
  if (clean.length > 120) throw new Error(`${label} is too long`);
  for (const pattern of BANNED) if (pattern.test(clean)) throw new Error(`${label} uses a word or topic sparks avoid (${pattern.source})`);
  if (YES_NO.test(clean)) throw new Error(`${label} can be answered with yes or no`);
  return clean;
}

function checkTranslations(raw: unknown, languages: string[], label: string) {
  const items = Array.isArray(raw) ? (raw as Array<{ language?: unknown; text?: unknown }>) : [];
  const out: Record<string, string> = {};
  for (const item of items) {
    if (typeof item.language === "string" && languages.includes(item.language) && typeof item.text === "string" && item.text.trim()) {
      if (item.text.trim().length > 200) throw new Error(`${label} translation to ${item.language} is too long`);
      out[item.language] = item.text.trim();
    }
  }
  const missing = languages.filter((l) => !out[l]);
  if (missing.length) throw new Error(`${label} is missing translations for ${missing.join(", ")}`);
  return out;
}

export function validateSpark(raw: unknown, data: Context): Payload {
  const s = raw as Record<string, unknown>;
  const targets = data.languages.filter((l) => l !== "en");
  const byName = new Map<string, Id<"members"> | null>();
  for (const m of data.members) byName.set(m.name, byName.has(m.name) ? null : m.id);
  const member = (name: unknown, label: string) => {
    if (typeof name !== "string" || !byName.has(name)) throw new Error(`${label} "${String(name)}" is not a member name`);
    const id = byName.get(name);
    if (!id) throw new Error(`${label} "${name}" matches more than one member`);
    return id;
  };
  const text = checkSparkText(s.text, "text");
  const type = s.type as Payload["type"];
  if (!["show", "tell", "ask", "together", "sealed"].includes(type)) throw new Error(`unknown type ${String(s.type)}`);
  const yesterday = data.history.find((h) => h.date === addDays(data.date, -1));
  if (yesterday?.type === type) throw new Error(`type ${type} was used yesterday`);
  const lower = text.toLowerCase().replace(/[.!?]+$/, "");
  const windowAgo = data.history.find((h) => h.text.toLowerCase().startsWith(WINDOW_SPARK));
  for (const h of data.history) {
    if (h.text.toLowerCase().replace(/[.!?]+$/, "") === lower && !(lower.startsWith(WINDOW_SPARK) && windowAgo && windowAgo.date <= addDays(data.date, -28))) {
      throw new Error("text repeats a spark from the history");
    }
  }
  let authorId: Id<"members"> | undefined;
  let askId: Id<"askQueue"> | undefined;
  let addressedTo: Id<"members"> | undefined;
  if (s.addressed_to !== "everyone" && s.addressed_to !== null && s.addressed_to !== undefined) addressedTo = member(s.addressed_to, "addressed_to");
  if (type === "ask") {
    authorId = member(s.author, "author");
    const item = data.queue.find((q) => q.authorId === authorId);
    if (!item) throw new Error("type ask needs the author of a queued question");
    if (item.addressedToId && item.addressedToId !== addressedTo) throw new Error("keep the queued question aimed at the same person");
    askId = item.id;
  } else if (s.author !== null && s.author !== undefined) {
    throw new Error("author must be null unless type is ask");
  }
  const hiddenNames = Array.isArray(s.hidden_from) ? s.hidden_from : [];
  const hiddenFrom = [...new Set(hiddenNames.map((n) => member(n, "hidden_from")))];
  if (hiddenFrom.length && type !== "sealed") throw new Error("only sealed sparks hide from anyone");
  if (hiddenFrom.length > 0 && hiddenFrom.length >= data.members.length) throw new Error("hidden_from leaves too few people to answer");
  if (authorId && hiddenFrom.includes(authorId)) throw new Error("the author cannot be hidden from their own question");
  const spoken = typeof s.spoken_version === "string" ? s.spoken_version.trim() : "";
  if (!spoken || spoken.length > 240) throw new Error("spoken_version needs one short sentence");
  const reason = typeof s.reason === "string" ? s.reason.trim() : "";
  if (!reason || reason.length > 200) throw new Error("reason needs one short sentence");
  const more = Array.isArray(s.more_sparks) ? (s.more_sparks as Array<Record<string, unknown>>) : [];
  if (more.length !== 3) throw new Error("more_sparks needs exactly three alternates");
  const seenTypes = new Set<string>();
  const seenText = new Set([lower]);
  const moreSparks = more.map((m, i) => {
    const altText = checkSparkText(m.text, `more_sparks[${i}].text`);
    const altTypeValue = m.type as Payload["moreSparks"][number]["type"];
    if (!["show", "tell", "together", "sealed"].includes(altTypeValue)) throw new Error(`more_sparks[${i}] has type ${String(m.type)}; alternates are show, tell, together or sealed`);
    if (seenTypes.has(altTypeValue)) throw new Error("more_sparks need three different types");
    const key = altText.toLowerCase().replace(/[.!?]+$/, "");
    if (seenText.has(key)) throw new Error("all four sparks need different text");
    seenTypes.add(altTypeValue);
    seenText.add(key);
    return { text: altText, type: altTypeValue, translations: checkTranslations(m.translations, targets, `more_sparks[${i}]`) };
  });
  let segmentIdea: Payload["segmentIdea"];
  if (s.segment_idea) {
    const idea = s.segment_idea as { member?: unknown; title?: unknown };
    if (typeof idea.title !== "string" || !idea.title.trim() || idea.title.length > 40) throw new Error("segment_idea needs a short title");
    segmentIdea = { memberId: member(idea.member, "segment_idea.member"), title: idea.title.trim() };
  }
  return {
    text,
    type,
    ...(authorId ? { authorId } : {}),
    ...(addressedTo ? { addressedTo } : {}),
    ...(hiddenFrom.length ? { hiddenFrom } : {}),
    translations: checkTranslations(s.translations, targets, "text"),
    spokenVersion: spoken,
    moreSparks,
    reason,
    ...(segmentIdea ? { segmentIdea } : {}),
    ...(askId ? { askId } : {}),
    source: "ai",
  };
}

const translationArray = {
  type: "array",
  items: { type: "object", additionalProperties: false, required: ["language", "text"], properties: { language: { type: "string" }, text: { type: "string" } } },
};
const SPARK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "type", "author", "addressed_to", "hidden_from", "translations", "spoken_version", "more_sparks", "segment_idea", "reason"],
  properties: {
    text: { type: "string" },
    type: { type: "string", enum: ["show", "tell", "ask", "together", "sealed"] },
    author: { type: ["string", "null"] },
    addressed_to: { type: "string" },
    hidden_from: { type: "array", items: { type: "string" } },
    translations: translationArray,
    spoken_version: { type: "string" },
    more_sparks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "type", "translations"],
        properties: { text: { type: "string" }, type: { type: "string", enum: ["show", "tell", "together", "sealed"] }, translations: translationArray },
      },
    },
    segment_idea: {
      anyOf: [
        { type: "null" },
        { type: "object", additionalProperties: false, required: ["member", "title"], properties: { member: { type: "string" }, title: { type: "string" } } },
      ],
    },
    reason: { type: "string" },
  },
};

function fallbackPayload(data: Context): Payload {
  const { primary, moreSparks } = fallbackFilling(data.date, data.history.map((h) => ({ text: h.text, type: h.type ?? undefined })));
  const text = data.secretIngredient?.text ?? primary.text;
  const type = data.secretIngredient ? "tell" : primary.type;
  return {
    text,
    type,
    moreSparks: moreSparks.filter((m) => m.type !== type && m.type !== "ask").map((m) => ({ text: m.text, type: m.type as "show" | "tell" | "together" | "sealed" })),
    reason: data.secretIngredient ? "The Chef teased this spark at Sunday's Feast." : "Picked from the safe spark list.",
    source: data.secretIngredient ? "secretIngredient" : "fallback",
  };
}

export const save = internalMutation({
  args: { tableId: v.id("tables"), date: v.string(), regenerate: v.boolean(), feastId: v.optional(v.id("feasts")), filling: fillingPayload },
  returns: v.object({ status: v.union(v.literal("saved"), v.literal("exists"), v.literal("used"), v.literal("conflict")), fillingId: v.union(v.id("fillings"), v.null()) }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("fillings")
      .withIndex("by_tableId_and_date", (q) => q.eq("tableId", args.tableId).eq("date", args.date))
      .unique();
    if (existing) {
      const answered = await ctx.db.query("dumplings").withIndex("by_fillingId_and_memberId", (q) => q.eq("fillingId", existing._id)).first();
      if (answered) return { status: "used" as const, fillingId: existing._id };
      if (!args.regenerate) return { status: "exists" as const, fillingId: existing._id };
    }
    if (args.filling.askId && args.filling.askId !== existing?.askId) {
      const ask = await ctx.db.get("askQueue", args.filling.askId);
      if (!ask || ask.tableId !== args.tableId || ask.usedOn !== undefined) return { status: "conflict" as const, fillingId: null };
      await ctx.db.patch("askQueue", ask._id, { usedOn: args.date });
    }
    if (existing?.askId && existing.askId !== args.filling.askId) await ctx.db.patch("askQueue", existing.askId, { usedOn: undefined });
    const doc = { tableId: args.tableId, date: args.date, prompt: args.filling.text, ...args.filling };
    let fillingId: Id<"fillings">;
    if (existing) {
      await ctx.db.replace("fillings", existing._id, doc);
      fillingId = existing._id;
    } else {
      fillingId = await ctx.db.insert("fillings", doc);
    }
    if (args.feastId) {
      const feast = await ctx.db.get("feasts", args.feastId);
      if (feast && !feast.nextFillingId) await ctx.db.patch("feasts", feast._id, { nextFillingId: fillingId });
    }
    return { status: "saved" as const, fillingId };
  },
});

const resultValidator = v.object({
  status: v.union(v.literal("saved"), v.literal("exists"), v.literal("used"), v.literal("conflict"), v.literal("missing")),
  date: v.string(),
  source: v.union(v.string(), v.null()),
  attempts: v.number(),
  rejected: v.array(v.string()),
  hiddenFromYou: v.boolean(),
  spark: v.union(
    v.null(),
    v.object({
      text: v.string(),
      type: v.string(),
      author: v.union(v.string(), v.null()),
      addressedTo: v.union(v.string(), v.null()),
      hiddenFrom: v.array(v.string()),
      translations: v.record(v.string(), v.string()),
      spokenVersion: v.union(v.string(), v.null()),
      moreSparks: v.array(v.object({ text: v.string(), type: v.string(), translations: v.record(v.string(), v.string()) })),
      reason: v.union(v.string(), v.null()),
      segmentIdea: v.union(v.null(), v.object({ member: v.string(), title: v.string() })),
    }),
  ),
});
type Result = Infer<typeof resultValidator>;

async function generate(ctx: ActionCtx, tableId: Id<"tables">, date: string, regenerate: boolean, viewer?: Id<"members">): Promise<Result> {
  const data: Context | null = await ctx.runQuery(internal.sparks.context, { tableId, date });
  const empty = { date, source: null, attempts: 0, rejected: [] as string[], hiddenFromYou: false, spark: null };
  if (!data) return { ...empty, status: "missing" };
  if (data.existing?.answered) return { ...empty, status: "used" };
  if (data.existing && !regenerate) return { ...empty, status: "exists" };
  let payload: Payload | null = null;
  let attempts = 0;
  const rejected: string[] = [];
  if (process.env.OPENAI_API_KEY) {
    const input = {
      tableLanguages: data.languages,
      weekday: data.weekday,
      date: data.date,
      members: data.members.map((m) => ({ name: m.name, language: m.language, role: m.role, daysSincePost: m.daysSincePost })),
      elders: data.elders,
      birthdays: data.birthdays,
      history: data.history,
      queue: data.queue.map((q) => ({ author: q.author, addressedTo: q.addressedTo ?? "everyone", question: q.text })),
      callbacks: await callbacks(tableId),
      secretIngredient: data.secretIngredient?.text ?? null,
    };
    let feedback = "";
    for (attempts = 1; attempts <= 2 && !payload; attempts++) {
      try {
        const response = await openai("/responses", {
          model: TEXT_MODEL,
          instructions: SYSTEM_PROMPT + FORMAT_NOTE,
          input: JSON.stringify(input) + feedback,
          text: { format: { type: "json_schema", name: "spark", strict: true, schema: SPARK_SCHEMA } },
        });
        payload = validateSpark(JSON.parse(outputText(await response.json())), data);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        rejected.push(message.slice(0, 200));
        feedback = `\n\nYour previous spark was rejected: ${message}. Write a new one that fixes it.`;
      }
    }
    attempts--;
  }
  payload ??= fallbackPayload(data);
  const saved: { status: "saved" | "exists" | "used" | "conflict"; fillingId: Id<"fillings"> | null } = await ctx.runMutation(internal.sparks.save, {
    tableId,
    date,
    regenerate,
    ...(data.secretIngredient ? { feastId: data.secretIngredient.feastId } : {}),
    filling: payload,
  });
  const name = (id: Id<"members"> | undefined) => (id ? (data.members.find((m) => m.id === id)?.name ?? null) : null);
  const hiddenFromYou = viewer !== undefined && (payload.hiddenFrom ?? []).includes(viewer);
  return {
    status: saved.status,
    date,
    source: payload.source,
    attempts,
    rejected,
    hiddenFromYou,
    spark: saved.status !== "saved" || hiddenFromYou
      ? null
      : {
          text: payload.text,
          type: payload.type,
          author: name(payload.authorId),
          addressedTo: name(payload.addressedTo),
          hiddenFrom: (payload.hiddenFrom ?? []).map((id) => name(id) ?? "Someone"),
          translations: payload.translations ?? {},
          spokenVersion: payload.spokenVersion ?? null,
          moreSparks: payload.moreSparks.map((m) => ({ text: m.text, type: m.type, translations: m.translations ?? {} })),
          reason: payload.reason ?? null,
          segmentIdea: payload.segmentIdea ? { member: name(payload.segmentIdea.memberId) ?? "Someone", title: payload.segmentIdea.title } : null,
        },
  };
}

export const generateFilling = internalAction({
  args: { tableId: v.id("tables"), date: v.string() },
  returns: resultValidator,
  handler: async (ctx, args): Promise<Result> => {
    const result = await generate(ctx, args.tableId, args.date, false);
    console.info(`Spark for ${args.date}: ${result.status} via ${result.source ?? "none"} after ${result.attempts} model attempts`);
    return result;
  },
});

export const debugAccess = internalQuery({
  args: sessionArgs,
  returns: v.union(v.null(), v.object({ tableId: v.id("tables"), memberId: v.id("members"), timeZone: v.string() })),
  handler: async (ctx, args) => {
    const session = await findMember(ctx, args);
    if (!session) return null;
    const { member, table } = session;
    if (member.role !== "host" && table.joinCode !== DEMO_JOIN_CODE) return null;
    return { tableId: table._id, memberId: member._id, timeZone: table.timeZone };
  },
});

export const generateNow = action({
  args: sessionArgs,
  returns: resultValidator,
  handler: async (ctx, args): Promise<Result> => {
    const access: { tableId: Id<"tables">; memberId: Id<"members">; timeZone: string } | null = await ctx.runQuery(internal.sparks.debugAccess, args);
    if (!access) throw new ConvexError("Generate now is for the Table host or the demo Table.");
    const tomorrow = addDays(dateInZone(Date.now(), access.timeZone), 1);
    return await generate(ctx, access.tableId, tomorrow, true, access.memberId);
  },
});

export const tomorrowSparks = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("tables").paginate({ numItems: 50, cursor: args.cursor ?? null });
    const now = Date.now();
    for (const table of page.page) {
      if (localHour(now, table.timeZone) < GENERATE_FROM_HOUR) continue;
      const today = dateInZone(now, table.timeZone);
      const tomorrow = addDays(today, 1);
      const exists = await ctx.db
        .query("fillings")
        .withIndex("by_tableId_and_date", (q) => q.eq("tableId", table._id).eq("date", tomorrow))
        .first();
      if (exists) continue;
      await ctx.scheduler.runAfter(0, internal.sparks.generateFilling, { tableId: table._id, date: tomorrow });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.sparks.tomorrowSparks, { cursor: page.continueCursor });
    return null;
  },
});
