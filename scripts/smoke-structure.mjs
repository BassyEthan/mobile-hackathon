#!/usr/bin/env node
// Exercises the Table, onboarding, profile, guest and notification plumbing added with the UX restructure.
import { ConvexHttpClient } from "convex/browser";
import { anyApi as api } from "convex/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) throw new Error("Set EXPO_PUBLIC_CONVEX_URL (npx convex dev writes it to .env.local).");
const http = new ConvexHttpClient(url);
const clips = join(import.meta.dirname, "..", "seed", "clips");
const zone = "America/Los_Angeles";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());
const check = (label, ok) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) process.exitCode = 1;
};
const rejects = (promise) => promise.then(() => false, () => true);
const session = ({ token, memberId }) => ({ token, memberId });

async function fold(member, extra = {}) {
  const uploadUrl = await http.mutation(api.dumplings.generateUploadUrl, member);
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": "video/mp4" }, body: readFileSync(join(clips, "clip1.mp4")) });
  const { storageId } = await response.json();
  return http.mutation(api.dumplings.fold, { ...member, storageId, mediaType: "video", ...extra });
}

// Host onboarding answers are stored and used.
const created = await http.mutation(api.tables.create, {
  tableName: "Structure Smoke",
  displayName: "Host",
  nickname: "Bao",
  language: "en",
  motherTongue: "en",
  wishLanguage: "zh",
  languages: ["en", "es"],
  timeZone: zone,
  feastHour: 15,
  intake: { who: ["parents", "grandparents"], distance: "countries", lastTogether: "months", missMost: "food" },
});
const host = session(created);
const hostMe = await http.query(api.tables.me, host);
check("host profile keeps nickname, mother tongue and wish language", hostMe.nickname === "Bao" && hostMe.motherTongue === "en" && hostMe.wishLanguage === "zh");
check("Table keeps Feast time and caption languages", hostMe.feastHour === 15 && hostMe.tableLanguages.includes("es"));
const first = await http.query(api.today.get, { ...host, date: today });
check("first spark comes from what the host misses most", first.filling?.prompt === "Show us the last thing you cooked or ate." && first.filling.sparks.length === 4);
check("unknown Feast time is rejected", await rejects(http.mutation(api.tables.updateTable, { ...host, feastHour: 11 })));

// The invite link previews the Table before joining.
const preview = await http.query(api.tables.preview, { joinCode: created.joinCode, invitedBy: host.memberId });
check("invite preview shows the inviter and who is there", preview?.inviterName === "Host" && preview.members.length === 1 && preview.tableName === "Structure Smoke");
check("invite preview of an unknown code is empty", (await http.query(api.tables.preview, { joinCode: "ZZZZZZ" })) === null);

const maya = session(await http.mutation(api.tables.join, { joinCode: created.joinCode, displayName: "Maya", language: "es", motherTongue: "es", invitedBy: host.memberId }));
const mayaMe = await http.query(api.tables.me, maya);
check("member joins as a member with their mother tongue", mayaMe.role === "member" && mayaMe.motherTongue === "es" && mayaMe.prompted.length === 0);

// Seats, the day strip and folding.
let seats = await http.query(api.tables.seats, { ...host, date: today });
check("Table lists both seats, nobody folded yet", seats.length === 2 && seats.every((s) => !s.foldedToday));
const hostClip = await fold(host, { fillingId: first.filling.id, sparkKey: "primary" });
seats = await http.query(api.tables.seats, { ...host, date: today });
check("Table shows who folded today", seats.find((s) => s.isMe).foldedToday && !seats.find((s) => !s.isMe).foldedToday);
const week = await http.query(api.today.week, { ...host, date: today });
check("day strip has seven days ending today with the new clip", week.length === 7 && week[6].date === today && week[6].clips === 1 && week[6].mine);

// Asking one person.
await http.mutation(api.asks.submit, { ...host, text: "What did you eat for lunch?", addressedTo: maya.memberId });
const asked = await http.query(api.today.asksForMe, maya);
check("a question addressed to Maya reaches Maya", asked.length === 1 && asked[0].authorName === "Host");
check("the host does not see their own question as asked of them", (await http.query(api.today.asksForMe, host)).length === 0);

// Profiles respect the lid.
let mayaViewOfHost = await http.query(api.members.profile, { ...maya, targetId: host.memberId });
check("someone else's profile hides clips still under today's lid", mayaViewOfHost.clips.length === 0 && !mayaViewOfHost.isMe);
const mayaClip = await fold(maya);
mayaViewOfHost = await http.query(api.members.profile, { ...maya, targetId: host.memberId });
check("after folding, their clip shows on the profile", mayaViewOfHost.clips.some((c) => c.id === hostClip));
const own = await http.query(api.members.profile, { ...host, targetId: host.memberId });
check("your own profile lists your clips, phrases and awards", own.isMe && own.clips.length === 1 && Array.isArray(own.phrases) && Array.isArray(own.awards));

// Sharing and deleting your own clip.
check("only the owner can allow sharing", await rejects(http.mutation(api.dumplings.setShare, { ...maya, dumplingId: hostClip, allowShare: true })));
await http.mutation(api.dumplings.setShare, { ...host, dumplingId: hostClip, allowShare: true });
check("owner allows sharing", (await http.query(api.today.get, { ...maya, date: today })).dumplings.find((d) => d.id === hostClip)?.allowShare === true);
check("only the owner can delete a clip", await rejects(http.mutation(api.dumplings.remove, { ...host, dumplingId: mayaClip })));
const reply = await fold(host, { replyTo: mayaClip });
await http.mutation(api.dumplings.remove, { ...maya, dumplingId: mayaClip });
const afterDelete = await http.query(api.today.get, { ...host, date: today });
check("deleted clip is gone and its reply stays as its own clip", !afterDelete.dumplings.some((d) => d.id === mayaClip) && afterDelete.dumplings.some((d) => d.id === reply && d.replyTo === null));

// Reflections, settings and Elder mode.
check("an impossible birthday is rejected", await rejects(http.mutation(api.tables.updateProfile, { ...maya, birthday: { month: 13, day: 1 } })));
await http.mutation(api.tables.updateProfile, { ...maya, birthday: { month: 4, day: 2 }, voiceOnly: true, notifyFrom: 9, missMost: "voices" });
await http.mutation(api.tables.promptDone, { ...maya, key: "wishLanguage" });
const mayaAfter = await http.query(api.tables.me, maya);
check("settings and reflective answers save", mayaAfter.birthday?.month === 4 && mayaAfter.voiceOnly && mayaAfter.notifyFrom === 9 && mayaAfter.missMost === "voices" && mayaAfter.prompted.includes("wishLanguage"));
check("only the host can switch on Elder mode", await rejects(http.mutation(api.tables.setElder, { ...maya, targetId: host.memberId, isElder: true })));
await http.mutation(api.tables.setElder, { ...host, targetId: maya.memberId, isElder: true });
check("host switches Elder mode on for a member", (await http.query(api.tables.me, maya)).isElder === true);
check("a bad push token is rejected", await rejects(http.mutation(api.tables.savePushToken, { ...maya, pushToken: "not-a-token" })));
await http.mutation(api.tables.savePushToken, { ...maya, pushToken: "ExponentPushToken[smoke-test]" });
check("a push token saves", (await http.query(api.tables.me, maya)).hasPushToken === true);

// A grandparent by phone gets a watch-only guest seat.
check("a short phone number is rejected", await rejects(http.mutation(api.tables.addGuest, { ...host, displayName: "Grandma", phone: "123" })));
const guest = session(await http.mutation(api.tables.addGuest, { ...host, displayName: "Grandma Lin", phone: "+1 (555) 010-2030" }));
check("guest link signs in as a guest", (await http.query(api.tables.me, guest))?.role === "guest");
check("guest is listed on the Table but not in the day's seats", (await http.query(api.tables.seats, { ...host, date: today })).some((s) => s.role === "guest") && !(await http.query(api.today.get, { ...host, date: today })).members.some((m) => m.displayName === "Grandma Lin"));

// The Feast tab.
const upcoming = await http.query(api.feasts.upcoming, { ...host, date: today });
check("Feast countdown reports this week and the chosen hour", upcoming.feastHour === 15 && upcoming.clipsThisWeek >= 2 && upcoming.sealedWaiting === 0);
check("nothing in the Freezer for a new Table", (await http.query(api.feasts.freezer, { ...host, date: today })) === null);
const feastId = await http.mutation(api.feasts.cook, host);
let list = [];
for (let i = 0; i < 40; i++) {
  list = await http.query(api.feasts.list, host);
  if (list[0]?.status !== "cooking") break;
  await new Promise((r) => setTimeout(r, 1000));
}
check("first Feast is the Pilot, with a week number", list[0]?.id === feastId && list[0].isPilot && list[0].weekNumber === 1 && list[0].kind === "weekly");
const episode = await http.query(api.feasts.get, { ...host, feastId });
check("Feast carries its week for the player", episode?.weekNumber === 1 && typeof episode.weekOf === "string");
const phraseUpload = await fetch(await http.mutation(api.dumplings.generateUploadUrl, host), { method: "POST", headers: { "Content-Type": "audio/mp4" }, body: new Uint8Array(64) });
const phraseStorage = (await phraseUpload.json()).storageId;
check("a phrase that is not in the Feast cannot be saved", await rejects(http.mutation(api.members.attemptPhrase, { ...host, feastId, phrase: "not here", storageId: phraseStorage })));

// Leaving and deleting.
await http.mutation(api.tables.leave, maya);
check("leaving signs that seat out", (await http.query(api.tables.me, maya)) === null);
check("the Table no longer lists them", !(await http.query(api.tables.seats, { ...host, date: today })).some((s) => s.displayName === "Maya"));
const sam = session(await http.mutation(api.tables.join, { joinCode: created.joinCode, displayName: "Sam", language: "en" }));
const samClip = await fold(sam);
await http.mutation(api.tables.leave, host);
check("when the host leaves, the next member becomes host", (await http.query(api.tables.me, sam)).role === "host");
await http.mutation(api.tables.deleteAccount, sam);
check("deleting an account signs it out", (await http.query(api.tables.me, sam)) === null);
const ivy = session(await http.mutation(api.tables.join, { joinCode: created.joinCode, displayName: "Ivy", language: "en" }));
const ivyClip = await fold(ivy);
const ivyDay = await http.query(api.today.get, { ...ivy, date: today });
check("their clips are deleted with them", ivyDay.lidOff && ivyDay.dumplings.some((d) => d.id === ivyClip) && !ivyDay.dumplings.some((d) => d.id === samClip));
