import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';

import { Color } from '@/constants/dumpling';

/**
 * The Dumpling logo: a smiling dumpling that is also a speech bubble.
 * Traced from the brand artwork so it stays crisp at any size. The viewBox is cropped to the bubble itself,
 * so `size` is the drawn width and the height follows the logo's own proportions.
 */
export const LOGO_RATIO = 1080 / 1250;

export function DumplingLogo({ size = 120, mood = 'smile' }: { size?: number; mood?: 'smile' | 'wow' }) {
  return (
    <Svg width={size} height={size * LOGO_RATIO} viewBox="110 140 1250 1080" accessibilityLabel="Dumpling">
      <Path
        d="M212 1172 L282 955 C205 925 160 880 160 790 C160 450 420 187 735 187 C1060 187 1305 470 1305 790 C1305 935 1150 985 760 985 L462 985 Z"
        fill={Color.logoCream}
        stroke={Color.logoInk}
        strokeWidth={52}
        strokeLinejoin="round"
      />
      <G fill="none" stroke={Color.logoInk} strokeWidth={44} strokeLinecap="round">
        <Path d="M468 272 C500 330 478 380 432 420" />
        <Path d="M600 228 C628 280 618 322 582 365" />
        <Path d="M738 206 C762 258 757 302 734 346" />
        <Path d="M868 222 C895 270 897 322 882 365" />
        <Path d="M1000 282 C1027 330 1036 372 1035 418" />
        {mood === 'smile' && <Path d="M668 765 C705 805 765 810 800 765" />}
      </G>
      {mood === 'wow' && <Ellipse cx={734} cy={785} rx={34} ry={40} fill={Color.logoInk} />}
      <Circle cx={617} cy={670} r={53} fill={Color.logoInk} />
      <Circle cx={850} cy={670} r={53} fill={Color.logoInk} />
      <Ellipse cx={500} cy={785} rx={80} ry={48} fill={Color.logoCheek} />
      <Ellipse cx={965} cy={785} rx={80} ry={48} fill={Color.logoCheek} />
    </Svg>
  );
}

/** The logo set on a logo-orange disc, for places that want a compact brand mark (headers, list icons). */
export function LogoMark({ size = 40, ring = true }: { size?: number; ring?: boolean }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: Color.logo,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 1.5 : 0,
        borderColor: Color.logoInk,
      }}>
      <View style={{ marginLeft: size * 0.02, marginTop: size * 0.04 }}>
        <DumplingLogo size={size * 0.74} />
      </View>
    </View>
  );
}
