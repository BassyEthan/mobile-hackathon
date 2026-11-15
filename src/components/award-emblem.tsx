import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

/**
 * The Golden Dumpling: a struck medallion rather than a trophy. One warm-gold gradient, fine pleats, a quiet laurel.
 */
export function AwardEmblem({ size = 132 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 132 132" accessibilityLabel="Golden Dumpling emblem" accessibilityRole="image">
      <Defs>
        <LinearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#F1D592" />
          <Stop offset="1" stopColor="#C7963F" />
        </LinearGradient>
      </Defs>
      <Circle cx={66} cy={66} r={62} fill="#2A201A" />
      <Circle cx={66} cy={66} r={55} fill="none" stroke="#6E5532" strokeWidth={1} />
      {/* Laurel */}
      <Path d="M30 86C24 74 24 60 30 48M102 86C108 74 108 60 102 48" fill="none" stroke="#8B6C3B" strokeWidth={1.5} strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <Path key={`l${i}`} d={`M${29 - (i === 0 || i === 3 ? 0 : 2)} ${52 + i * 10}c-6-1-9-4-10-8c5 0 8 3 10 8z`} fill="#8B6C3B" />
      ))}
      {[0, 1, 2, 3].map((i) => (
        <Path key={`r${i}`} d={`M${103 + (i === 0 || i === 3 ? 0 : 2)} ${52 + i * 10}c6-1 9-4 10-8c-5 0-8 3-10 8z`} fill="#8B6C3B" />
      ))}
      {/* Dumpling */}
      <Path d="M36 80C36 58 50 42 66 42S96 58 96 80C96 87 84 90 66 90S36 87 36 80Z" fill="url(#gold)" />
      <Path d="M48 50L52 64M60 44L62 60M72 44L70 60M84 50L80 64" fill="none" stroke="#9C7330" strokeWidth={2} strokeLinecap="round" />
      <Path d="M44 78C52 82 80 82 88 78" fill="none" stroke="#FFF1CC" strokeOpacity={0.55} strokeWidth={1.5} strokeLinecap="round" />
    </Svg>
  );
}
