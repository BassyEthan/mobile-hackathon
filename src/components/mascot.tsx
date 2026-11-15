import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { DumplingLogo, LOGO_RATIO } from '@/components/logo';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { Color } from '@/constants/dumpling';

function Steam({ delay, x, size, color }: { delay: number; x: number; size: number; color?: string }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
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
        opacity: progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.7, 0] }),
        transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [size * 0.3, -size * 0.1] }) }],
      }}>
      <Svg width={size * 0.14} height={size * 0.32} viewBox="0 0 14 32">
        <Path d="M7 31 C1 24 13 18 7 11 C2 5 9 2 7 1" stroke={color ?? Color.textSoft} strokeOpacity={0.6} strokeWidth={2.5} fill="none" strokeLinecap="round" />
      </Svg>
    </Animated.View>
  );
}

/** The logo with optional rising steam. Used wherever the dumpling appears inside the app. */
export function Mascot({ size = 120, steaming = true, mood = 'smile', steamColor }: { size?: number; steaming?: boolean; mood?: 'smile' | 'wow'; steamColor?: string }) {
  const reduced = useReducedMotion();
  const steam = size * 0.3;
  return (
    <View style={{ width: size, height: size * LOGO_RATIO + steam }}>
      {steaming && !reduced && (
        <>
          <Steam delay={0} x={size * 0.32} size={size} color={steamColor} />
          <Steam delay={700} x={size * 0.46} size={size} color={steamColor} />
          <Steam delay={1400} x={size * 0.6} size={size} color={steamColor} />
        </>
      )}
      <View style={{ position: 'absolute', bottom: 0 }}>
        <DumplingLogo size={size} mood={mood} />
      </View>
    </View>
  );
}
