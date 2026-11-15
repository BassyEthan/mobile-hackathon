#!/usr/bin/env node
import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { anyApi } from "convex/server";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) throw new Error("Set EXPO_PUBLIC_CONVEX_URL (npx convex dev writes it to .env.local).");
const api = anyApi;
const http = new ConvexHttpClient(url);
const live = new ConvexClient(url);
const clips = join(import.meta.dirname, "..", "seed", "clips");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
};

async function upload(token, file) {
  const uploadUrl = await http.mutation(api.dumplings.generateUploadUrl, { token });
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

const a = await http.mutation(api.tables.create, { tableName: "Smoke Test", displayName: "Session A", language: "en", timeZone: "America/Los_Angeles" });
const b = await http.mutation(api.tables.join, { joinCode: a.joinCode, displayName: "Session B", language: "es" });
check("two independent tokens", a.token !== b.token);
const fillingId = await http.mutation(api.today.ensureFilling, { token: a.token });

await http.mutation(api.dumplings.fold, { token: a.token, fillingId, storageId: await upload(a.token, "clip1.mp4"), mediaType: "video" });
const bBefore = await http.query(api.today.get, { token: b.token, date: today });
check("B sees that A folded", bBefore.members.some((m) => m.displayName === "Session A" && m.folded));
check("lid stays on for B, no clip details or URLs", !bBefore.lidOff && bBefore.dumplings.length === 0 && !JSON.stringify(bBefore).includes("http"));
const aView = await http.query(api.today.get, { token: a.token, date: today });
const aDumplingId = aView.dumplings[0].id;
const blocked = await http.mutation(api.reactions.tap, { token: b.token, dumplingId: aDumplingId, kind: "heart" }).then(() => false, () => true);
check("B cannot react before folding", blocked);

const revealed = next(api.today.get, { token: b.token, date: today }, (v) => v.lidOff);
await http.mutation(api.dumplings.fold, { token: b.token, fillingId, storageId: await upload(b.token, "clip2.mp4"), mediaType: "video" });
const bAfter = await revealed;
check("lid lifts live for B after folding, with media URLs", bAfter.dumplings.length === 2 && bAfter.dumplings.every((d) => d.url?.startsWith("http")));

const reacted = next(api.today.get, { token: a.token, date: today }, (v) => v.dumplings.find((d) => d.id === aDumplingId)?.reactions.counts.heart === 1);
await http.mutation(api.reactions.tap, { token: b.token, dumplingId: aDumplingId, kind: "heart" });
await reacted;
check("A receives B's tap reaction live", true);
const bogus = await http.query(api.today.get, { token: "not-a-member", date: today }).then(() => false, () => true);
check("unknown token is rejected", bogus);
await live.close();
