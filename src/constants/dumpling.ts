import { Platform } from 'react-native';

/**
 * Dumpling's design language: warm editorial minimalism.
 * Ivory paper, espresso ink, hairline borders. Orange is heat: it marks the one action that matters on a screen,
 * active states and small brand accents. Family video carries the colour everywhere else.
 */
export const Color = {
  bg: '#FFFAF4',
  surface: '#FFFFFF',
  surface2: '#F7F0E7',
  text: '#30251F',
  textSoft: '#82746A',
  brand: '#E8753D',
  brandDeep: '#C85A2C',
  brandTint: '#FCEDE3',
  border: '#EDE3D8',
  borderStrong: '#DDCFBF',
  night: '#17110E',
  nightSurface: '#251C17',
  nightText: '#FBF4EC',
  nightSoft: '#B9AA9C',
  nightLine: 'rgba(251,244,236,0.16)',
  gold: '#D7AE5E',
  goldDeep: '#A57A2E',
  goldSoft: '#F4E5C3',
  danger: '#B9442E',
  success: '#4F7A4A',
  scrim: 'rgba(23,17,14,0.42)',
} as const;

/** 4 / 8 / 12 / 16 / 24 / 32 / 40 */
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40, gutter: 20 } as const;

/** Corner radii are deliberately different per role so nothing looks inflated. */
export const Radius = { card: 20, tile: 16, button: 16, chip: 12, sheet: 24, round: 999 } as const;

export const Font = {
  /** SF Pro (system) for interface text. */
  ui: Platform.select({ ios: 'System', default: undefined }),
  /** SF Pro Rounded, reserved for brand moments: the wordmark, Feast titles, award names. */
  brand: Platform.select({ ios: 'ui-rounded', web: 'ui-rounded, system-ui, sans-serif', default: undefined }),
} as const;

/** Size / line height pairs. Weights stay between regular and semibold. */
export const Type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: '600' },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
} as const;

export const LANGUAGES: { code: string; label: string; english: string }[] = [
  { code: 'en', label: 'English', english: 'English' },
  { code: 'es', label: 'Español', english: 'Spanish' },
  { code: 'zh', label: '中文', english: 'Chinese' },
  { code: 'ko', label: '한국어', english: 'Korean' },
  { code: 'ja', label: '日本語', english: 'Japanese' },
  { code: 'vi', label: 'Tiếng Việt', english: 'Vietnamese' },
  { code: 'tl', label: 'Tagalog', english: 'Tagalog' },
  { code: 'hi', label: 'हिन्दी', english: 'Hindi' },
  { code: 'fr', label: 'Français', english: 'French' },
];

export function languageLabel(code: string | null | undefined) {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code ?? '';
}

export const FEAST_TIMES = [
  { key: 'morning', hour: 10, label: 'Morning', detail: 'Around 10 AM' },
  { key: 'afternoon', hour: 15, label: 'Afternoon', detail: 'Around 3 PM' },
  { key: 'evening', hour: 18, label: 'Evening', detail: 'Around 6 PM' },
] as const;

export function feastTimeLabel(hour: number) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Soft, warm avatar grounds. Chosen by name so each person keeps their colour. */
const AVATAR_TONES = ['#F3D9C6', '#E9DCC5', '#DCE3CF', '#D8E1E4', '#EBD3D6', '#E4D8EA', '#F1E2B9'];
export function avatarTone(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}
