#!/usr/bin/env node
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) throw new Error("Set EXPO_PUBLIC_CONVEX_URL (npx convex dev writes it to .env.local).");
const http = new ConvexHttpClient(url);
const clips = join(import.meta.dirname, "..", "seed", "clips");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) process.exitCode = 1;
};
const rejects = (promise) => promise.then(() => false, () => true);
const session = ({ token, memberId }) => ({ token, memberId });
const words = (text) => text.trim().split(/\s+/).length;

async function fold(member, extra = {}) {
  const uploadUrl = await http.mutation(api.dumplings.generateUploadUrl, member);
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: readFileSync(join(clips, "clip1.mp4")) });
  return http.mutation(api.dumplings.fold, { ...member, storageId: (await response.json()).storageId, mediaType: "video", ...extra });
}

const created = await http.mutation(api.tables.create, { tableName: "Spark Smoke", displayName: "Host", language: "en", timeZone: "America/Los_Angeles" });
const host = session(created);
const abuela = session(await http.mutation(api.tables.join, { joinCode: created.joinCode, displayName: "Abuela", language: "es" }));
const nai = session(await http.mutation(api.tables.join, { joinCode: created.joinCode, displayName: "Nai Nai", language: "zh" }));
const fillingId = await http.mutation(api.today.ensureFilling, host);

const hostToday = await http.query(api.today.get, { ...host, date: today });
const sealedSpark = hostToday.filling.sparks.find((s) => s.type === "sealed");
check("today's fallback sparks are four distinct, safe-list sparks", new Set(hostToday.filling.sparks.map((s) => s.english)).size === 4);
const opening = await fold(host);
check("host folds with no spark", typeof opening === "string");

check("a member who is not host cannot Generate now", await rejects(http.action(api.sparks.generateNow, abuela)));
await http.mutation(api.asks.submit, { ...abuela, text: "Nai Nai, tell us what tea you drank as a girl", addressedTo: nai.memberId });
const generated = await http.action(api.sparks.generateNow, host);
const spark = generated.spark;
console.log(JSON.stringify(generated, null, 2));
check("Generate now saves tomorrow's spark", generated.status === "saved" && generated.date === tomorrow, `${generated.status} ${generated.date}`);
check("Generate now used the model", generated.source === "ai", `source ${generated.source}, attempts ${generated.attempts}`);
const all = spark ? [spark, ...spark.moreSparks] : [];
check("four sparks, all twelve words or fewer", all.length === 4 && all.every((s) => words(s.text) <= 12));
check("alternates have three different types", new Set(spark?.moreSparks.map((s) => s.type)).size === 3);
check("every spark is translated to es and zh", all.every((s) => s.translations.es && s.translations.zh));
check("spoken version and reason are present", Boolean(spark?.spokenVersion && spark?.reason));
if (spark?.type === "ask") check("a queued question is credited to its real author", spark.author === "Abuela", spark.author);

const again = await http.action(api.sparks.generateNow, host);
check("Generate now again replaces the unused spark without duplicating it", again.status === "saved" && again.date === tomorrow);

const abuelaEarly = await http.query(api.today.get, { ...abuela, date: today });
check("a pre-generated tomorrow does not lift today's lid", !abuelaEarly.lidOff && abuelaEarly.dumplings.length === 0 && !JSON.stringify(abuelaEarly).includes("http"));
const abuelaTomorrow = await http.query(api.today.get, { ...abuela, date: tomorrow });
check("tomorrow's spark is not served before tomorrow", abuelaTomorrow.filling === null && abuelaTomorrow.dumplings.length === 0);
check("Abuela cannot react to today's clip early", await rejects(http.mutation(api.reactions.tap, { ...abuela, dumplingId: opening, kind: "heart" })));

if (!sealedSpark) {
  check("today's fallback offers a sealed alternate on this weekday", false, hostToday.filling.sparks.map((s) => s.type).join(","));
} else {
  const sealedId = await fold(nai, { fillingId, sparkKey: sealedSpark.key });
  const naiView = await http.query(api.today.get, { ...nai, date: today });
  check("a sealed Fold still lifts the lid for its author", naiView.lidOff);
  check("sealed clip stays off its author's Steamer", !naiView.dumplings.some((d) => d.id === sealedId));
  const hostView = await http.query(api.today.get, { ...host, date: today });
  check("sealed clip stays off everyone's Steamer, with no id or URL", !JSON.stringify(hostView).includes(sealedId));
  check("a sealed-only Fold does not show its author as in", !hostView.members.find((m) => m.displayName === "Nai Nai").folded);
  check("nobody can react to a sealed clip", await rejects(http.mutation(api.reactions.tap, { ...host, dumplingId: sealedId, kind: "heart" })));
  check("nobody can Fold back to a sealed clip", await rejects(fold(host, { replyTo: sealedId })));
}
