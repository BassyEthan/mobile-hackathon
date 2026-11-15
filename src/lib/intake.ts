import { getLocales } from 'expo-localization';

import { LANGUAGES } from '@/constants/dumpling';

/** Questions in start.tsx, before the Table exists. */
export const START_STEPS = 5;
/** Steps across the whole host flow (5 questions in start.tsx, then 4 in setup.tsx), for one continuous progress bar. */
export const HOST_STEPS = START_STEPS + 4;
/** setup.tsx numbers its steps from here (kept stable so a half-finished setup saved on a device still resumes). */
export const SETUP_FIRST_STEP = 11;

export const MISS_MOST = [
  { key: 'voices', label: 'Their voices', line: 'you miss their voices' },
  { key: 'food', label: 'The food', line: 'you miss the food' },
  { key: 'jokes', label: 'The jokes', line: 'you miss the jokes' },
  { key: 'knowing', label: 'Just knowing what they’re up to', line: 'you miss knowing what they’re up to' },
] as const;

/** The first spark for each answer to "What do you miss most?". Mirrors convex/tables.ts FIRST_SPARKS. */
export const FIRST_SPARK: Record<string, string> = {
  voices: 'Everyone, say good morning the way your family says it.',
  food: 'Show us the last thing you cooked or ate.',
  jokes: 'Tell us the last thing that made you laugh out loud.',
  knowing: 'Show us what’s outside your window.',
};

export function deviceLanguage() {
  try {
    const code = getLocales()[0]?.languageCode ?? 'en';
    return LANGUAGES.some((l) => l.code === code) ? code : 'en';
  } catch {
    return 'en';
  }
}

export function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'America/Los_Angeles';
  } catch {
    return 'America/Los_Angeles';
  }
}
