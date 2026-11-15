import { Platform } from 'react-native';

export const Palette = {
  border: '#DED8CC',
  night: '#1D1916',
  gold: '#D9B877',
  cream: '#F8F5EE',
  creamDeep: '#EEE8DC',
  card: '#FCFAF6',
  accent: '#AD6043',
  accentDeep: '#85442D',
  ink: '#352F29',
  inkSoft: '#756C62',
  steam: '#EADBC8',
  good: '#5B7F4A',
  danger: '#B3412E',
} as const;

export const Radius = { card: 8, button: 8, chip: 6 } as const;

export const Type = {
  display: Platform.select({ ios: 'Georgia', default: 'serif' }),
  family: Platform.select({ ios: 'System', default: undefined }),
  hero: 30,
  title: 21,
  body: 17,
  small: 14,
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

export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, hero: 40 } as const;
