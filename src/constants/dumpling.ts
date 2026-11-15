import { Platform } from 'react-native';

export const Palette = {
  border: '#EDE3D8',
  night: '#1D1916',
  gold: '#D9B877',
  cream: '#FFFAF4',
  creamDeep: '#F7F0E7',
  card: '#FFFFFF',
  accent: '#E8753D',
  accentDeep: '#C85A2C',
  ink: '#30251F',
  inkSoft: '#82746A',
  steam: '#EADBC8',
  good: '#5B7F4A',
  danger: '#B3412E',
} as const;

export const Radius = { card: 22, button: 16, chip: 12 } as const;

export const Type = {
  family: Platform.select({ ios: 'System', default: undefined }),
  hero: 30,
  title: 21,
  body: 16,
  small: 13,
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
