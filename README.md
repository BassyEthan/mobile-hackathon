# mobile-hackathon
YC Consumer Mobile Hackathon project

Expo (SDK 58) app using Expo Router and TypeScript, backed by Convex.

## Getting started

```bash
npm install
npx convex dev      # pushes convex/ and writes EXPO_PUBLIC_CONVEX_URL to .env.local
npx expo start
```

`.env.local` is gitignored. With a `CONVEX_DEPLOY_KEY` in the environment, `convex dev` targets that deployment; a deploy key without the `deployment:logs:view` permission needs `--tail-logs disable`.

## Temporary Convex connection check

The **Convex** tab (`src/app/convex-check.tsx`) calls the `connectionCheck.recent` query and `connectionCheck.record` mutation from `convex/connectionCheck.ts`. Remove the tab, screen, function file, and `connectionChecks` table once real features exist.
