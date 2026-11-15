# Dumpling
YC Consumer Mobile Hackathon project

Dumpling turns a family's week into a show they watch every Sunday. Expo (SDK 58) app with Expo Router and TypeScript, backed by Convex. It runs in Expo Go on iOS and Android; every native module it uses ships in Expo Go.

## Getting started

```bash
npm install
npx convex dev      # pushes convex/ and writes EXPO_PUBLIC_CONVEX_URL to .env.local
npx expo start
```

`.env.local` is gitignored. With a `CONVEX_DEPLOY_KEY` in the environment, `convex dev` targets that deployment; a deploy key without the `deployment:logs:view` permission needs `--tail-logs disable`.

## Demo Table

```bash
npx convex env set SEED_KEY "$(openssl rand -hex 24)"   # once per deployment
npm run seed
```

`npm run seed` uploads the six clips in `seed/clips/` to Convex storage and resets the demo Table: five members, a week of Fillings and clips, reactions, the latest Sunday Feast and one Leftovers Feast. Today's Filling already has three clips under the lid. Join it with code **DUMPLN**.

## Time zone and week policy

Every Table stores an IANA time zone (the creator's device zone, `America/Los_Angeles` by default). A day is that zone's calendar date. A week runs Monday through Sunday and is keyed by its Sunday (`weekOf`). There is one Feast row per Table and week (`feasts.by_tableId_and_weekOf`). **Cook the Feast now** and the Sunday cron both go through `schedule.startCook`: it returns the week's existing cooking or ready row, re-cooks a failed row in place, or inserts the row and schedules `chef.cook`.

Crons (`convex/crons.ts`) run hourly so every zone is covered:
- `schedule.dailyFillings` creates each Table's Filling for its local date. The first Filling after a Feast is that Feast's Secret Ingredient.
- `schedule.sundayFeasts` cooks each Table's Feast once its local time is Sunday 5 PM or later.

A Feast only uses clips from closed Fillings (a day with a later Filling), so nothing still under today's lid can reach it.

## AI

Set `OPENAI_API_KEY` and `SUPERMEMORY_API_KEY` on the Convex deployment (`npx convex env set ...`). They are read only inside Convex actions:
- `ai.processDumpling` runs after each Fold. It transcribes with `gpt-transcribe` and translates into the Table's languages. The Fold and the lid lift never wait for it.
- `chef.cook` picks 4 to 6 clips, fetches Supermemory callbacks, makes one structured `gpt-6.1-terra` planning call (retried once if invalid), voices Chef lines with `gpt-4o-mini-tts` into Convex storage, and saves a summary to Supermemory.

Without the keys, captions use seeded transcripts and a template Chef cooks the Feast, so the demo keeps working.

## Temporary Convex connection check

The **Convex** tab (`src/app/(tabs)/convex-check.tsx`) calls the `connectionCheck.recent` query and `connectionCheck.record` mutation from `convex/connectionCheck.ts`. Remove the tab, screen, function file, and `connectionChecks` table once Dumpling passes its device check.
