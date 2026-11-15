import { getLocales } from 'expo-localization';

import { LANGUAGES } from '@/constants/dumpling';

/** Steps across the whole host flow (start.tsx then setup.tsx), for one continuous progress bar. */
export const HOST_STEPS = 15;

export const WHO = [
  { key: 'parents', label: 'Parents', person: 'your mom' },
  { key: 'grandparents', label: 'Grandparents', person: 'your grandma' },
  { key: 'siblings', label: 'Siblings', person: 'your brother or sister' },
  { key: 'partner', label: 'Partner', person: 'your partner' },
  { key: 'children', label: 'Children', person: 'your kids' },
  { key: 'chosen', label: 'Chosen family', person: 'your people' },
] as const;

export const DISTANCE = [
  { key: 'home', label: 'Same home', line: 'Even under one roof, the days slip by.' },
  { key: 'city', label: 'Same city', line: 'Even in the same city, weeks go by.' },
  { key: 'cities', label: 'Different cities', line: 'Across cities, that adds up.' },
  { key: 'countries', label: 'Different countries', line: 'Across countries and time zones, that adds up.' },
] as const;

export const LAST_TOGETHER = [
  { key: 'week', label: 'This week', line: 'You were together this week' },
  { key: 'month', label: 'This month', line: 'It’s been a few weeks since you were all together' },
  { key: 'months', label: 'Months ago', line: 'It’s been months since you were all together' },
  { key: 'year', label: 'Over a year', line: 'It’s been over a year since you were all in one place' },
  { key: 'unknown', label: 'Can’t remember', line: 'It’s been so long you can’t remember the last time you were all together' },
] as const;

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

/** Mirror the host's answers back in one honest sentence. */
export function reflection(answers: { lastTogether: string | null; missMost: string | null; distance: string | null }) {
  const last = LAST_TOGETHER.find((l) => l.key === answers.lastTogether)?.line;
  const miss = MISS_MOST.find((m) => m.key === answers.missMost)?.line;
  const distance = DISTANCE.find((d) => d.key === answers.distance)?.line;
  const first = last && miss ? `${last}, and ${miss}.` : last ? `${last}.` : miss ? `${miss[0].toUpperCase()}${miss.slice(1)}.` : 'Your family matters to you.';
  return answers.lastTogether === 'week' ? `You were together this week${miss ? `, and still ${miss}` : ''}.` : distance ? `${first} ${distance}` : first;
}

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
