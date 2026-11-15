#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const npx = (args) => execFileSync("npx", args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
const seedKey = process.env.SEED_KEY || npx(["convex", "env", "get", "SEED_KEY"]);
if (!seedKey) throw new Error("Set SEED_KEY on the Convex deployment first.");
const run = (fn, args = {}) => JSON.parse(npx(["convex", "run", fn, JSON.stringify({ seedKey, ...args })]));

const dir = join(import.meta.dirname, "..", "seed", "clips");
const files = readdirSync(dir).filter((f) => f.endsWith(".mp4")).sort();
const clips = [];
for (const file of files) {
  const response = await fetch(run("seed:uploadUrl"), {
    method: "POST",
    headers: { "Content-Type": "video/mp4" },
    body: readFileSync(join(dir, file)),
  });
  if (!response.ok) throw new Error(`Upload of ${file} failed with ${response.status}`);
  clips.push((await response.json()).storageId);
  console.log(`uploaded ${file}`);
}
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const result = run("seed:demo", { today, clips });
console.log(`Seeded demo Table for ${today}. Join code: ${result.joinCode}`);
