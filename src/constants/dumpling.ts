import { Platform } from 'react-native';

export const Palette = {
  cream: '#FFF6E9',
  creamDeep: '#F7E6CC',
  card: '#FFFDF8',
  accent: '#E8743B',
  accentDeep: '#C4562A',
  ink: '#3B2A20',
  inkSoft: '#7A6555',
  steam: '#EADBC8',
  good: '#5B7F4A',
  danger: '#B3412E',
} as const;

export const Radius = { card: 28, button: 999, chip: 20 } as const;

export const Type = {
  family: Platform.select({ ios: 'ui-rounded', default: undefined }),
  hero: 34,
  title: 26,
  body: 19,
  small: 15,
} as const;

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '中文' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'vi', label: 'Tiếng Việt' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'fr', label: 'Français' },
];
