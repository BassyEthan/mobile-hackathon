#!/usr/bin/env node
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) throw new Error("Set EXPO_PUBLIC_CONVEX_URL (npx convex dev writes it to .env.local).");
const http = new ConvexHttpClient(url);
const live = new ConvexClient(url);
const clips = join(import.meta.dirname, "..", "seed", "clips");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
};
const rejects = (promise) => promise.then(() => false, () => true);
const session = ({ token, memberId }) => ({ token, memberId });

async function upload(member, file) {
  const uploadUrl = await http.mutation(api.dumplings.generateUploadUrl, member);
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: readFileSync(join(clips, file)) });
  return (await response.json()).storageId;
}

function next(query, args, predicate, ms = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for live update")), ms);
    const unsubscribe = live.onUpdate(query, args, (value) => {
      if (predicate(value)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(value);
      }
    });
  });
}

const created = await http.mutation(api.tables.create, { tableName: "Smoke Test", displayName: "Session A", language: "en", timeZone: "America/Los_Angeles" });
const a = session(created);
const b = session(await http.mutation(api.tables.join, { joinCode: created.joinCode, displayName: "Session B", language: "es" }));
check("join returns distinct tokens and member IDs", a.token !== b.token && a.memberId !== b.memberId);
check("bad join code is rejected", await rejects(http.mutation(api.tables.join, { joinCode: "ABC", displayName: "X", language: "en" })));
check("token with another member's ID is rejected", (await http.query(api.tables.me, { token: a.token, memberId: b.memberId })) === null);
check("mismatched member ID cannot write", await rejects(http.mutation(api.today.ensureFilling, { token: a.token, memberId: b.memberId })));
const fillingId = await http.mutation(api.today.ensureFilling, a);
const fold = async (member, file, extra = {}) =>
  http.mutation(api.dumplings.fold, { ...member, storageId: await upload(member, file), mediaType: "video", ...extra });

const sparks = (await http.query(api.today.get, { ...a, date: today })).filling.sparks;
check("today's spark offers four distinct sparks", sparks.length === 4 && new Set(sparks.map((s) => s.text)).size === 4);

const aDumplingId = await fold(a, "clip1.mp4");
const aView = await http.query(api.today.get, { ...a, date: today });
check("A folds with no spark and the lid lifts for A", aView.lidOff && aView.dumplings.some((d) => d.id === aDumplingId && d.spark === null));
const bBefore = await http.query(api.today.get, { ...b, date: today });
check("B sees that A is in", bBefore.members.some((m) => m.displayName === "Session A" && m.folded));
check("lid stays on for B: no clips, URLs or reactions", !bBefore.lidOff && bBefore.dumplings.length === 0 && !JSON.stringify(bBefore).includes("http"));
check("B cannot react before folding", await rejects(http.mutation(api.reactions.tap, { ...b, dumplingId: aDumplingId, kind: "heart" })));
check("B cannot Fold back to a clip it cannot see", await rejects(fold(b, "clip2.mp4", { replyTo: aDumplingId })));
check("unknown spark key is rejected", await rejects(fold(b, "clip2.mp4", { fillingId, sparkKey: "alt9" })));

const revealed = next(api.today.get, { ...b, date: today }, (v) => v.lidOff);
const bSpark = await fold(b, "clip2.mp4", { fillingId, sparkKey: "alt1" });
const bAfter = await revealed;
check("lid lifts live for B after folding, with media URLs", bAfter.dumplings.length === 2 && bAfter.dumplings.every((d) => d.url?.startsWith("http")));
check("B's Fold records the chosen alternate spark", bAfter.dumplings.find((d) => d.id === bSpark)?.spark === sparks[2].text);

const reply = await fold(b, "clip2.mp4", { replyTo: aDumplingId });
const withReply = await http.query(api.today.get, { ...a, date: today });
check("second same-day Fold is allowed and points at its parent", withReply.dumplings.find((d) => d.id === reply)?.replyTo === aDumplingId);
const c = session(await http.mutation(api.tables.join, { joinCode: created.joinCode, displayName: "Session C", language: "en" }));
const cView = await http.query(api.today.get, { ...c, date: today });
check("new member C sees names but no media before folding", !cView.lidOff && cView.dumplings.length === 0 && !JSON.stringify(cView).includes("http"));
check("C cannot react to B's reply", await rejects(http.mutation(api.reactions.tap, { ...c, dumplingId: reply, kind: "heart" })));
const other = await http.mutation(api.tables.create, { tableName: "Other Table", displayName: "Outsider", language: "en", timeZone: "America/Los_Angeles" });
check("another Table cannot Fold back to this clip", await rejects(fold(session(other), "clip1.mp4", { replyTo: aDumplingId })));

const reacted = next(api.today.get, { ...a, date: today }, (v) => v.dumplings.find((d) => d.id === aDumplingId)?.reactions.counts.heart === 1);
await http.mutation(api.reactions.tap, { ...b, dumplingId: aDumplingId, kind: "heart" });
await reacted;
check("A receives B's tap reaction live", true);
check("Table week number starts at one", withReply.week === 1);

check("blank or overlong questions are rejected", (await rejects(http.mutation(api.asks.submit, { ...a, text: "  " }))) && (await rejects(http.mutation(api.asks.submit, { ...a, text: "x".repeat(141) }))));
check("question cannot be addressed to another Table's member", await rejects(http.mutation(api.asks.submit, { ...a, text: "What's for dinner?", addressedTo: other.memberId })));
await http.mutation(api.asks.submit, { ...a, text: "  What did you cook this week?  ", addressedTo: b.memberId });
check("Ask the Table records one question this week", (await http.query(api.asks.status, { ...a, date: today })).askedThisWeek);
check("a second question the same week is rejected", await rejects(http.mutation(api.asks.submit, { ...a, text: "Another one?" })));
check("B still has a question to ask", !(await http.query(api.asks.status, { ...b, date: today })).askedThisWeek);

const first = await http.mutation(api.feasts.cook, a);
const second = await http.mutation(api.feasts.cook, b);
check("Cook now returns one canonical Feast per Table and week", first === second);
const feasts = await http.query(api.feasts.list, a);
check("one Feast row for this week", feasts.filter((f) => f.id === first).length === 1 && feasts.length === 1);
const cooked = await next(api.feasts.list, a, (list) => list[0]?.status !== "cooking", 120000);
check(`Feast finished cooking (${cooked[0].status})`, cooked[0].status === "ready");
const feast = await http.query(api.feasts.get, { ...b, feastId: first });
check("Feast never includes clips from today's open day", !feast.segments.some((s) => s.type === "clip"));
check("Feast seats folks who did not fold with a Chef line, no Empty Plate", feast.segments.every((s) => s.type !== "award" || s.award !== "Empty Plate"));
check("unknown token is rejected", await rejects(http.query(api.today.get, { token: "not-a-member", memberId: a.memberId, date: today })));
await live.close();
