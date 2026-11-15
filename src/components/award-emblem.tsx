import Svg, { Circle, Path } from 'react-native-svg';
export function AwardEmblem() {
  return <Svg width={128} height={128} viewBox="0 0 128 128" accessibilityLabel="Golden Dumpling emblem" accessibilityRole="image">
    <Circle cx={64} cy={64} r={58} fill="#34291D" stroke="#756044" strokeWidth={1} />
    <Circle cx={64} cy={64} r={49} fill="none" stroke="#756044" strokeWidth={0.5} />
    <Path d="M27 76C27 51 44 35 64 35S101 51 101 76C101 85 86 89 64 89S27 85 27 76Z" fill="#D9B877" stroke="#F1D8A4" strokeWidth={2} />
    <Path d="M42 44L47 59M56 37L59 55M72 37L69 55M86 44L81 59" fill="none" stroke="#A17B42" strokeWidth={2} strokeLinecap="round" />
  </Svg>;
}
