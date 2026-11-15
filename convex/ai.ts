import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { outputText } from "./chef";

const TRANSCRIBE_MODEL = "gpt-transcribe";
const TRANSLATE_MODEL = "gpt-6-luna";

export const forDumpling = internalQuery({
  args: { dumplingId: v.id("dumplings") },
  returns: v.union(v.null(), v.object({ storageId: v.id("_storage"), languages: v.array(v.string()) })),
  handler: async (ctx, args) => {
    const dumpling = await ctx.db.get("dumplings", args.dumplingId);
    if (!dumpling) return null;
    const members = await ctx.db.query("members").withIndex("by_tableId", (q) => q.eq("tableId", dumpling.tableId)).take(50);
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
    if (!transcript) return null;
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
