import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { outputText } from "./chef";
import { clampWindow, heuristicWindow, lineFor, quickTimeAsMp4, type Word } from "./highlight";
import { tableMembers } from "./lib";

const TRANSCRIBE_MODEL = "gpt-transcribe";
const TRANSLATE_MODEL = "gpt-6-luna";
// Word timestamps for the highlight picker; the main transcription model only returns text.
const TIMESTAMP_MODEL = "whisper-1";
const HIGHLIGHT_MODEL = "gpt-6.1-terra";

export const forDumpling = internalQuery({
  args: { dumplingId: v.id("dumplings") },
  returns: v.union(v.null(), v.object({ storageId: v.id("_storage"), languages: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const dumpling = await ctx.db.get("dumplings", args.dumplingId);
    // Photos have nothing to transcribe.
    if (!dumpling || dumpling.mediaType === "photo") return null;
    const members = await tableMembers(ctx, dumpling.tableId, { guests: true });
    return { storageId: dumpling.mediaStorageId, languages: [...new Set(members.map((m) => m.language))] };
  },
});

export const saveTranscript = internalMutation({
  args: { dumplingId: v.id("dumplings"), transcript: v.string(), language: v.optional(v.string()), translation: v.record(v.string(), v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch("dumplings", args.dumplingId, { transcript: args.transcript, language: args.language, translation: args.translation });
    return null;
  },
});

export const processDumpling = internalAction({
  args: { dumplingId: v.id("dumplings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    const info = await ctx.runQuery(internal.ai.forDumpling, args);
    if (!info) return null;
    const media = await ctx.storage.get(info.storageId);
    if (!media || media.size > 25 * 1024 * 1024) return null;
    const form = new FormData();
    form.append("file", media, media.type.startsWith("audio") ? "fold.m4a" : "fold.mp4");
    form.append("model", TRANSCRIBE_MODEL);
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!response.ok) {
      console.error(`Transcription failed with status ${response.status}`);
      return null;
    }
    const result = (await response.json()) as { text?: string; languages?: Array<{ code: string }> };
    const transcript = result.text?.trim() ?? "";
    const language = result.languages?.[0]?.code?.slice(0, 2);
    if (!transcript || PHANTOM.test(transcript)) return null;
    const targets = info.languages.filter((l) => l !== language);
    let translation: Record<string, string> = {};
    if (targets.length > 0) {
      const translated = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: TRANSLATE_MODEL,
          instructions: "Translate this short family video caption naturally and warmly into each requested language code. Keep names unchanged.",
          input: JSON.stringify({ text: transcript, languages: targets }),
          text: {
            format: {
              type: "json_schema",
              name: "translations",
              strict: true,
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["items"],
                properties: {
                  items: {
                    type: "array",
                    items: { type: "object", additionalProperties: false, required: ["language", "text"], properties: { language: { type: "string" }, text: { type: "string" } } },
                  },
                },
              },
            },
          },
        }),
      });
      if (translated.ok) {
        const parsed = JSON.parse(outputText(await translated.json())) as { items: Array<{ language: string; text: string }> };
        translation = Object.fromEntries(parsed.items.filter((i) => targets.includes(i.language)).map((i) => [i.language, i.text]));
      }
    }
    await ctx.runMutation(internal.ai.saveTranscript, { dumplingId: args.dumplingId, transcript, language, translation });
    return null;
  },
});

export const saveHighlight = internalMutation({
  args: { dumplingId: v.id("dumplings"), start: v.number(), end: v.number(), line: v.optional(v.string()), duration: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const dumpling = await ctx.db.get("dumplings", args.dumplingId);
    if (!dumpling) return null;
    await ctx.db.patch("dumplings", args.dumplingId, {
      highlight: { start: args.start, end: args.end, ...(args.line ? { line: args.line } : {}) },
      ...(args.duration ? { duration: args.duration } : {}),
    });
    return null;
  },
});

type Timed = { duration?: number; words?: Word[]; segments?: Array<{ start: number; end: number; text: string; no_speech_prob?: number }> };

// Whisper fills silence with stock phrases. A clip of a sunrise should not be quoted as saying "You".
const PHANTOM = /^(you|thank you|thanks for watching|bye|okay|so|uh|um|\.+)[.!?]*$/i;

/** Keep only speech Whisper itself believes in, so silent clips fall back to the visual default. */
function realSpeech(timed: Timed): Timed {
  const segments = (timed.segments ?? []).filter((s) => (s.no_speech_prob ?? 0) < 0.5 && !PHANTOM.test(s.text.trim()));
  const inSpeech = (w: Word) => segments.some((s) => w.start >= s.start - 0.05 && w.end <= s.end + 0.05);
  const words = (timed.words ?? []).filter((w) => typeof w.start === "number" && typeof w.end === "number" && inSpeech(w));
  return { duration: timed.duration, segments, words: words.length > 0 && !PHANTOM.test(words.map((w) => w.word.trim()).join(" ")) ? words : [] };
}

/** Ask the Chef which 3 to 5 seconds are the ones the family will replay. */
async function chefPick(key: string, timed: Timed, duration: number | null) {
  const segments = (timed.segments ?? []).map((s) => ({ start: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10, text: s.text.trim() }));
  if (segments.length === 0) return null;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: HIGHLIGHT_MODEL,
      instructions:
        "You edit a family's weekly highlight reel. Given a short home video's timestamped transcript, choose the single most entertaining 3 to 5 second stretch: a laugh, a punchline, a surprise, a reveal, a kid saying something unexpected, a grandparent's best line. Prefer a complete phrase over a cut-off one. Avoid greetings, setup and 'is this recording'. Return start and end in seconds, and line: the words spoken in that stretch.",
      input: JSON.stringify({ duration, segments }),
      text: {
        format: {
          type: "json_schema",
          name: "highlight",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["start", "end", "line"],
            properties: { start: { type: "number" }, end: { type: "number" }, line: { type: "string" } },
          },
        },
      },
    }),
  });
  if (!response.ok) return null;
  const pick = JSON.parse(outputText(await response.json())) as { start: number; end: number; line: string };
  return pick;
}

/**
 * Find and save the best bite of a video or voice fold, for the Feast's highlight reel. Returns whether a bite was saved.
 * The Chef also calls this while cooking, for any clip whose bite is not picked yet.
 */
export async function pickHighlight(ctx: ActionCtx, dumplingId: Id<"dumplings">): Promise<boolean> {
    const key = process.env.OPENAI_API_KEY;
    const info = await ctx.runQuery(internal.ai.forDumpling, { dumplingId });
    if (!info || !key) return false;
    const media = await ctx.storage.get(info.storageId);
    if (!media || media.size > 25 * 1024 * 1024) return false;
    const isAudio = media.type.startsWith("audio");
    const file = new Blob([quickTimeAsMp4(await media.arrayBuffer())], { type: isAudio ? "audio/mp4" : "video/mp4" });
    let timed: Timed = {};
    try {
      const form = new FormData();
      form.append("file", file, isAudio ? "fold.m4a" : "fold.mp4");
      form.append("model", TIMESTAMP_MODEL);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      form.append("timestamp_granularities[]", "segment");
      const response = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form });
      if (response.ok) timed = realSpeech((await response.json()) as Timed);
      else console.warn(`Highlight timestamps failed with status ${response.status}: ${(await response.text()).slice(0, 200)}`);
    } catch {
      console.warn("Highlight timestamps failed");
    }
    const duration = typeof timed.duration === "number" && timed.duration > 0 ? timed.duration : null;
    // Without a length there is nothing safe to save; the player picks a bite itself once it knows the length.
    if (duration === null) return false;
    const words = timed.words ?? [];
    let window = heuristicWindow(words, duration);
    try {
      const pick = await chefPick(key, timed, duration);
      if (pick) {
        const clamped = clampWindow(pick.start, pick.end, duration);
        window = { ...clamped, line: lineFor(words, clamped) ?? (pick.line.trim().slice(0, 120) || undefined) };
      }
    } catch {
      console.warn("Highlight pick failed, using the liveliest stretch");
    }
    await ctx.runMutation(internal.ai.saveHighlight, { dumplingId, ...window, duration });
    return true;
}

export const findHighlight = internalAction({
  args: { dumplingId: v.id("dumplings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await pickHighlight(ctx, args.dumplingId);
    return null;
  },
});
