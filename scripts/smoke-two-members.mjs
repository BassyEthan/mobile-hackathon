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

function next(query, args, predicate) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for live update")), 15000);
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

await http.mutation(api.dumplings.fold, { ...a, fillingId, storageId: await upload(a, "clip1.mp4"), mediaType: "video" });
const bBefore = await http.query(api.today.get, { ...b, date: today });
check("B sees that A folded", bBefore.members.some((m) => m.displayName === "Session A" && m.folded));
check("lid stays on for B: no clips, URLs or reactions", !bBefore.lidOff && bBefore.dumplings.length === 0 && !JSON.stringify(bBefore).includes("http"));
const aView = await http.query(api.today.get, { ...a, date: today });
const aDumplingId = aView.dumplings[0].id;
check("B cannot react before folding", await rejects(http.mutation(api.reactions.tap, { ...b, dumplingId: aDumplingId, kind: "heart" })));

const revealed = next(api.today.get, { ...b, date: today }, (v) => v.lidOff);
await http.mutation(api.dumplings.fold, { ...b, fillingId, storageId: await upload(b, "clip2.mp4"), mediaType: "video" });
const bAfter = await revealed;
check("lid lifts live for B after folding, with media URLs", bAfter.dumplings.length === 2 && bAfter.dumplings.every((d) => d.url?.startsWith("http")));

const reacted = next(api.today.get, { ...a, date: today }, (v) => v.dumplings.find((d) => d.id === aDumplingId)?.reactions.counts.heart === 1);
await http.mutation(api.reactions.tap, { ...b, dumplingId: aDumplingId, kind: "heart" });
await reacted;
check("A receives B's tap reaction live", true);

const first = await http.mutation(api.feasts.cook, a);
const second = await http.mutation(api.feasts.cook, b);
check("Cook now returns one canonical Feast per Table and week", first === second);
const feasts = await http.query(api.feasts.list, a);
check("one Feast row for this week", feasts.filter((f) => f.id === first).length === 1 && feasts.length === 1);
const cooked = await next(api.feasts.list, a, (list) => list[0]?.status !== "cooking");
check(`Feast finished cooking (${cooked[0].status})`, cooked[0].status === "ready");
const feast = await http.query(api.feasts.get, { ...b, feastId: first });
check("Feast never includes clips from today's open Filling", !feast.segments.some((s) => s.type === "clip"));
check("unknown token is rejected", await rejects(http.query(api.today.get, { token: "not-a-member", memberId: a.memberId, date: today })));
await live.close();
