import { Platform } from 'react-native';

/**
 * Dumpling's design language: the family kitchen.
 * Rice-paper cream, soy-brown ink, confident outlines and food colours: chili, saffron, bok choy, porcelain,
 * plum and peach. Headings are set in a serif, like a handwritten family recipe card; controls stay rounded and
 * sturdy so every age at the table can use them.
 */
export const Color = {
  bg: '#FBF2E4',
  surface: '#FFFCF7',
  surface2: '#F3E4CC',
  text: '#37251A',
  textSoft: '#7A6455',
  ink: '#37251A',
  brand: '#E2633A',
  brandDeep: '#B4471F',
  brandTint: '#FBE0D2',
  border: '#EADBC3',
  borderStrong: '#37251A',
  night: '#21150F',
  nightSurface: '#35251B',
  nightText: '#FBF2E4',
  nightSoft: '#CBB7A4',
  nightLine: 'rgba(251,242,228,0.18)',
  gold: '#EFAE3A',
  goldDeep: '#8F5F0C',
  goldSoft: '#FAE6BA',
  sun: '#EFAE3A',
  mint: '#5E9E74',
  mintSoft: '#DDEEDD',
  sky: '#3F8796',
  skySoft: '#D8EAEC',
  grape: '#8C4E6B',
  grapeSoft: '#F1DEE6',
  pink: '#EE9F7E',
  pinkSoft: '#FBE4D8',
  danger: '#C23B22',
  success: '#3F8A5A',
  scrim: 'rgba(33,21,15,0.5)',
  /** Exact colours from the logo artwork. */
  logo: '#EE8152',
  logoCream: '#FCF1DE',
  logoInk: '#37251A',
  logoCheek: '#F2AD90',
} as const;

/** Food colours, in order. Used to give cards and people a colour of their own. */
export const Pop = [
  { fill: Color.sun, soft: Color.goldSoft },
  { fill: Color.mint, soft: Color.mintSoft },
  { fill: Color.sky, soft: Color.skySoft },
  { fill: Color.grape, soft: Color.grapeSoft },
  { fill: Color.pink, soft: Color.pinkSoft },
  { fill: Color.brand, soft: Color.brandTint },
] as const;

/** Outline weights. Sturdy surfaces sit on a slightly thicker bottom edge so they read as pressable. */
export const Stroke = { line: 2, lip: 4 } as const;

/** 4 / 8 / 12 / 16 / 24 / 32 / 40 */
export const Space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 40, gutter: 20 } as const;

/** Soft but not bubbly corners. */
export const Radius = { card: 22, tile: 18, button: 16, chip: 12, pill: 999, sheet: 28, round: 999 } as const;

export const Font = {
  /** SF Pro (system) for interface text. */
  ui: Platform.select({ ios: 'System', default: undefined }),
  /**
   * Nunito: the brand face. Its rounded terminals echo the thick, soft strokes of the logo.
   * Always pair each face with its own weight (brand 700, display 800) so iOS and Android pick the same file.
   */
  brand: 'Nunito_700Bold',
  /** Nunito ExtraBold: titles, sparks, the wordmark. */
  display: 'Nunito_800ExtraBold',
  /** Nunito Bold Italic: quotes and taglines. */
  italic: 'Nunito_700Bold_Italic',
} as const;

/** Size / line height pairs. Nunito titles and headlines, plain system body. */
export const Type = {
  display: { fontSize: 32, lineHeight: 39, fontWeight: '800' },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '800' },
  headline: { fontSize: 17, lineHeight: 23, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  callout: { fontSize: 15, lineHeight: 21, fontWeight: '500' },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
} as const;

/** Variants set in Nunito ExtraBold; headline uses Nunito Bold. */
export const SERIF_VARIANTS = ['display', 'title'] as const;
export const ROUNDED_VARIANTS = ['headline'] as const;

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

/** Bright avatar grounds. Chosen by name so each person keeps their colour. */
const AVATAR_TONES = ['#EFAE3A', '#EE9F7E', '#9CC7A6', '#93C3CB', '#D9A9BE', '#E8875F', '#E3C27E'];
function nameHash(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return hash;
}
export function avatarTone(name: string) {
  return AVATAR_TONES[nameHash(name) % AVATAR_TONES.length];
}
/** The pop colour that belongs to a person, for tiles and accents around their moments. */
export function popFor(name: string) {
  return Pop[nameHash(name) % Pop.length];
}
