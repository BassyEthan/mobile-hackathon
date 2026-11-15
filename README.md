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

## Temporary Convex connection check

The **Convex** tab (`src/app/(tabs)/convex-check.tsx`) calls the `connectionCheck.recent` query and `connectionCheck.record` mutation from `convex/connectionCheck.ts`. Remove the tab, screen, function file, and `connectionChecks` table once Dumpling passes its device check.
