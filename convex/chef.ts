import { v } from "convex/values";
import type { Infer } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { segment } from "./schema";
import { FILLING_PROMPTS } from "./lib";

type Segment = Infer<typeof segment>;
type Gathered = NonNullable<FunctionReturnType<typeof internal.feasts.gather>>;
type Plan = { title: string; segments: Segment[]; secretIngredient: string; summary: string };

const TEXT_MODEL = "gpt-6.1-terra";
const TTS_MODEL = "gpt-4o-mini-tts";

export function pickClips(data: Gathered) {
  const byMember = new Map<string, Gathered["clips"]>();
  for (const clip of [...data.clips].sort((a, b) => b.reactionCount - a.reactionCount)) {
    byMember.set(clip.memberId, [...(byMember.get(clip.memberId) ?? []), clip]);
  }
  const picked: Gathered["clips"] = [];
  while (picked.length < 6 && [...byMember.values()].some((list) => list.length > 0)) {
    for (const list of byMember.values()) {
      const next = list.shift();
      if (next && picked.length < 6) picked.push(next);
    }
  }
  return picked.sort((a, b) => a.date.localeCompare(b.date));
}

function folds(data: Gathered) {
  const counts = new Map(data.members.map((m) => [m.name, 0]));
  for (const clip of data.clips) counts.set(clip.memberName, (counts.get(clip.memberName) ?? 0) + 1);
  return counts;
}

export function templatePlan(data: Gathered, clips: Gathered["clips"]): Plan {
  const segments: Segment[] = [
    { type: "hostLine", text: `Welcome to ${data.tableName}, where the portions are small and the stories are not.` },
  ];
  if (data.previous) {
    segments.push({ type: "titleCard", title: "Last Week", subtitle: data.previous.title });
  }
  if (clips.length === 0) {
    segments.push({ type: "hostLine", text: "The steamer was quiet this week, so the chef ate the leftovers." });
  }
  clips.forEach((clip, i) => {
    if (i % 2 === 0) segments.push({ type: "hostLine", text: `Here is ${clip.memberName}, answering "${clip.prompt}"` });
    segments.push({ type: "clip", dumplingId: clip.id });
  });
  const foreign = data.clips.find((c) => c.language && c.language !== "en" && c.transcript && c.english);
  if (foreign) {
    segments.push({ type: "titleCard", title: "Mother Tongue", phrase: foreign.transcript!, meaning: foreign.english! });
  }
  const golden = [...data.clips].sort((a, b) => b.reactionCount - a.reactionCount)[0];
  if (golden) {
    segments.push({ type: "award", award: "Golden Dumpling", memberName: golden.memberName, text: `${golden.reactionCount} reactions, and not one of them was polite.`, dumplingId: golden.id });
  }
  const counts = [...folds(data).entries()].sort((a, b) => a[1] - b[1]);
  if (counts.length > 0) {
    const [name, n] = counts[0];
    segments.push({ type: "award", award: "Empty Plate", memberName: name, text: n === 0 ? "No dumplings this week. We kept your chair warm." : `Only ${n} this week. The steamer misses you.` });
  }
  const secretIngredient = FILLING_PROMPTS[(data.weekOf.length + data.clips.length) % FILLING_PROMPTS.length];
  segments.push({ type: "secretIngredient", prompt: secretIngredient, text: "Next week's first Filling. Start thinking." });
  return {
    title: clips.length > 0 ? `Feast: ${clips.map((c) => c.memberName).filter((n, i, all) => all.indexOf(n) === i).slice(0, 3).join(", ")} and friends` : "Feast: A Quiet Week",
    segments,
    secretIngredient,
    summary: `${data.tableName} week of ${data.weekOf}: ${clips.map((c) => `${c.memberName} on "${c.prompt}": ${c.english ?? c.transcript ?? "a clip"}`).join("; ")}`,
  };
}

const FLAT_SEGMENT = {
  type: "object",
  additionalProperties: false,
  required: ["type", "text", "translations", "dumplingId", "title", "subtitle", "phrase", "romanization", "meaning", "award", "memberName", "prompt"],
  properties: {
    type: { type: "string", enum: ["hostLine", "clip", "titleCard", "award", "secretIngredient"] },
    text: { type: ["string", "null"] },
    translations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["language", "text"],
        properties: { language: { type: "string" }, text: { type: "string" } },
      },
    },
    dumplingId: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    subtitle: { type: ["string", "null"] },
    phrase: { type: ["string", "null"] },
    romanization: { type: ["string", "null"] },
    meaning: { type: ["string", "null"] },
    award: { type: ["string", "null"], enum: ["Golden Dumpling", "Empty Plate", null] },
    memberName: { type: ["string", "null"] },
    prompt: { type: ["string", "null"] },
  },
};

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "summary", "segments"],
  properties: {
    title: { type: "string" },
    summary: { type: "string" },
    segments: { type: "array", items: FLAT_SEGMENT },
  },
};

type Flat = Record<string, string | null> & { translations?: Array<{ language: string; text: string }> };

export function validatePlan(raw: unknown, data: Gathered, clips: Gathered["clips"]): Plan {
  const plan = raw as { title?: unknown; summary?: unknown; segments?: unknown };
  if (typeof plan?.title !== "string" || !Array.isArray(plan.segments)) throw new Error("Missing title or segments");
  const clipIds = new Set<string>(clips.map((c) => c.id));
  const languages = new Set(data.members.map((m) => m.language).filter((l) => l !== "en"));
  const localized = (s: Flat) => {
    const entries = (s.translations ?? []).filter((t) => languages.has(t.language) && t.text.trim()).map((t) => [t.language, t.text.trim()]);
    return entries.length > 0 ? { translations: Object.fromEntries(entries) as Record<string, string> } : {};
  };
  const memberNames = new Set(data.members.map((m) => m.name));
  const segments: Segment[] = [];
  const used = new Set<string>();
  for (const s of plan.segments as Flat[]) {
    const need = (key: string) => {
      const value = s[key];
      if (typeof value !== "string" || value.trim() === "") throw new Error(`${s.type} needs ${key}`);
      return value.trim();
    };
    if (s.type === "hostLine") {
      const text = need("text");
      if (text.length > 220 || (text.match(/[.!?](\s|$)/g)?.length ?? 1) > 1) throw new Error("Chef lines must be one sentence");
      segments.push({ type: "hostLine", text, ...localized(s) });
    } else if (s.type === "clip") {
      const id = need("dumplingId");
      if (!clipIds.has(id)) throw new Error(`Unknown clip ${id}`);
      if (used.has(id)) throw new Error(`Clip ${id} used twice`);
      used.add(id);
      segments.push({ type: "clip", dumplingId: id as Id<"dumplings"> });
    } else if (s.type === "titleCard") {
      segments.push({
        type: "titleCard",
        title: need("title"),
        ...(s.subtitle ? { subtitle: s.subtitle } : {}),
        ...(s.phrase ? { phrase: s.phrase } : {}),
        ...(s.romanization ? { romanization: s.romanization } : {}),
        ...(s.meaning ? { meaning: s.meaning } : {}),
      });
    } else if (s.type === "award") {
      const memberName = need("memberName");
      if (!memberNames.has(memberName)) throw new Error(`Unknown member ${memberName}`);
      const id = s.dumplingId && clipIds.has(s.dumplingId) ? (s.dumplingId as Id<"dumplings">) : undefined;
      segments.push({ type: "award", award: need("award"), memberName, text: need("text"), ...localized(s), ...(id ? { dumplingId: id } : {}) });
    } else if (s.type === "secretIngredient") {
      segments.push({ type: "secretIngredient", prompt: need("prompt"), text: need("text"), ...localized(s) });
    } else {
      throw new Error(`Unknown segment type ${s.type}`);
    }
  }
  if (segments[0]?.type !== "hostLine") throw new Error("Start with a hostLine cold open");
  if (used.size !== clipIds.size) throw new Error(`Use every one of the ${clipIds.size} selected clips exactly once`);
  if (data.previous && !segments.some((s) => s.type === "titleCard" && s.title === "Last Week")) throw new Error("Include a Last Week titleCard");
  if (clips.some((c) => c.language && c.language !== "en") && !segments.some((s) => s.type === "titleCard" && s.title === "Mother Tongue" && s.phrase && s.meaning)) {
    throw new Error("Include a Mother Tongue titleCard with phrase, romanization and meaning");
  }
  for (const award of ["Golden Dumpling", "Empty Plate"]) {
    if (!segments.some((s) => s.type === "award" && s.award === award)) throw new Error(`Include the ${award} award`);
  }
  const last = segments[segments.length - 1];
  if (last?.type !== "secretIngredient" || segments.filter((s) => s.type === "secretIngredient").length !== 1) {
    throw new Error("End with exactly one secretIngredient");
  }
  return { title: plan.title.slice(0, 80), segments, secretIngredient: last.prompt, summary: typeof plan.summary === "string" ? plan.summary : plan.title };
}

async function openai(path: string, body: unknown) {
  const response = await fetch(`https://api.openai.com/v1${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`OpenAI ${path} returned ${response.status}`);
  return response;
}

export function outputText(data: { output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> }) {
  return (data.output ?? [])
    .flatMap((item) => (item.type === "message" ? (item.content ?? []) : []))
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
}

async function callbacks(tableId: string) {
  if (!process.env.SUPERMEMORY_API_KEY) return [];
  try {
    const response = await fetch("https://api.supermemory.ai/v4/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPERMEMORY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ q: "running jokes, recurring moments and callbacks from past Feasts", containerTag: `dumpling_${tableId}`, limit: 5 }),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { results?: Array<{ memory?: string; chunk?: string }> };
    return (data.results ?? []).map((r) => r.memory ?? r.chunk ?? "").filter(Boolean).slice(0, 5);
  } catch {
    return [];
  }
}

async function remember(tableId: string, summary: string, feastId: string) {
  if (!process.env.SUPERMEMORY_API_KEY) return;
  try {
    await fetch("https://api.supermemory.ai/v3/documents", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.SUPERMEMORY_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: summary, containerTag: `dumpling_${tableId}`, customId: `feast_${feastId}` }),
    });
  } catch {}
}

async function aiPlan(data: Gathered, clips: Gathered["clips"]): Promise<Plan> {
  const memories = await callbacks(data.tableId);
  const brief = {
    table: data.tableName,
    chef: data.chefName,
    members: data.members.map((m) => m.name),
    captionLanguages: [...new Set(data.members.map((m) => m.language).filter((l) => l !== "en"))],
    foldsThisWeek: Object.fromEntries(folds(data)),
    lastWeek: data.previous,
    callbacks: memories,
    clips: clips.map((c) => ({
      dumplingId: c.id,
      member: c.memberName,
      day: c.date,
      filling: c.prompt,
      language: c.language,
      original: c.transcript,
      english: c.english,
      reactions: c.reactionCount,
      voiceReactions: c.voiceCount,
    })),
  };
  const instructions = `You are ${data.chefName}, host of a family's Sunday show called the Feast. Write the episode as an ordered list of segments.
Rules: start with a hostLine cold open. If lastWeek is not null, include a titleCard titled exactly "Last Week" with a subtitle recapping it, using a callback when one fits. Use every clip in the brief exactly once as a clip segment by dumplingId, in an order that tells the week well, with short hostLine intros between some of them. If any clip is not English, include a titleCard titled exactly "Mother Tongue" with phrase (original words from a clip), romanization (Latin letters) and meaning (English). Include award "Golden Dumpling" (most loved clip, set dumplingId) and award "Empty Plate" (gentle nudge to whoever folded least). End with exactly one secretIngredient: a new Filling prompt for next week plus a one-line tease. Every hostLine and award text is one sentence, warm and dry, never mean. Use only member names given. For every hostLine, award and secretIngredient, add translations of its text into each captionLanguages code (empty array for other segment types). Set unused fields to null. summary is two sentences for the family's memory.`;
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await openai("/responses", {
      model: TEXT_MODEL,
      instructions,
      input: JSON.stringify(brief) + feedback,
      text: { format: { type: "json_schema", name: "feast", strict: true, schema: PLAN_SCHEMA } },
    });
    try {
      return validatePlan(JSON.parse(outputText(await response.json())), data, clips);
    } catch (e) {
      feedback = `\n\nYour previous plan was rejected: ${e instanceof Error ? e.message : String(e)}. Fix it.`;
    }
  }
  throw new Error(`The Chef's plan failed validation twice.${feedback.replace(/\n/g, " ")}`);
}

async function voiceLines(ctx: ActionCtx, segments: Segment[]) {
  const voiced: Segment[] = [];
  for (const s of segments) {
    if (s.type !== "hostLine") {
      voiced.push(s);
      continue;
    }
    try {
      const response = await openai("/audio/speech", {
        model: TTS_MODEL,
        voice: "ash",
        input: s.text,
        instructions: "A warm, dry TV chef hosting a family dinner show. Unhurried, gently amused.",
        response_format: "mp3",
      });
      const audioStorageId = await ctx.storage.store(new Blob([await response.arrayBuffer()], { type: "audio/mpeg" }));
      voiced.push({ ...s, audioStorageId });
    } catch {
      voiced.push(s);
    }
  }
  return voiced;
}

export const cook = internalAction({
  args: { feastId: v.id("feasts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.feasts.gather, { feastId: args.feastId });
    if (!data) return null;
    try {
      const clips = pickClips(data);
      const plan = process.env.OPENAI_API_KEY ? await aiPlan(data, clips) : templatePlan(data, clips);
      const segments = process.env.OPENAI_API_KEY ? await voiceLines(ctx, plan.segments) : plan.segments;
      await ctx.runMutation(internal.feasts.finish, { feastId: args.feastId, title: plan.title, segments, secretIngredient: plan.secretIngredient });
      await remember(data.tableId, plan.summary, args.feastId);
    } catch (e) {
      await ctx.runMutation(internal.feasts.fail, { feastId: args.feastId, error: e instanceof Error ? e.message.slice(0, 300) : "Unknown error" });
    }
    return null;
  },
});
