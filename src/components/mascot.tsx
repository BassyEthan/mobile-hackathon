import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { Palette } from '@/constants/dumpling';

function Steam({ delay, x, size }: { delay: number; x: number; size: number }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, progress]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        opacity: progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.9, 0] }),
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [size * 0.3, -size * 0.1] }) }],
      }}>
      <Svg width={size * 0.14} height={size * 0.32} viewBox="0 0 14 32">
        <Path d="M7 31 C1 24 13 18 7 11 C2 5 9 2 7 1" stroke={Palette.steam} strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

export function Mascot({ size = 120, steaming = true, mood = 'smile' }: { size?: number; steaming?: boolean; mood?: 'smile' | 'wow' }) {
  return (
    <View style={{ width: size, height: size * 1.05 }}>
      {steaming && (
        <>
          <Steam delay={0} x={size * 0.3} size={size} />
          <Steam delay={700} x={size * 0.47} size={size} />
          <Steam delay={1400} x={size * 0.64} size={size} />
        </>
      )}
      <Svg width={size} height={size * 0.75} viewBox="0 0 120 90" style={{ position: 'absolute', bottom: 0 }}>
        <Path
          d="M8 70 C8 32 34 12 60 12 C86 12 112 32 112 70 C112 82 98 86 60 86 C22 86 8 82 8 70 Z"
          fill={Palette.card}
          stroke={Palette.ink}
          strokeWidth={3}
        />
        <Path d="M30 22 C34 30 36 34 36 40 M48 15 C50 24 51 30 50 36 M72 15 C70 24 69 30 70 36 M90 22 C86 30 84 34 84 40" stroke={Palette.creamDeep} strokeWidth={3} fill="none" strokeLinecap="round" />
        <Circle cx={44} cy={56} r={4.5} fill={Palette.ink} />
        <Circle cx={76} cy={56} r={4.5} fill={Palette.ink} />
        <Ellipse cx={34} cy={66} rx={7} ry={4} fill={Palette.accent} opacity={0.35} />
        <Ellipse cx={86} cy={66} rx={7} ry={4} fill={Palette.accent} opacity={0.35} />
        {mood === 'smile' ? (
          <Path d="M50 64 Q60 74 70 64" stroke={Palette.ink} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        ) : (
          <Ellipse cx={60} cy={68} rx={6} ry={7} fill={Palette.ink} />
        )}
      </Svg>
    </View>
  );
}
