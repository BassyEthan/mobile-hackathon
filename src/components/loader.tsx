import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';

import { DumplingLogo, LOGO_RATIO } from '@/components/logo';
import { Color } from '@/constants/dumpling';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/**
 * Dumpling's one loading animation: the logo crouches, hops, does a full flip like it is being tossed in a pan,
 * and lands with a little squash. Its shadow shrinks while it is in the air.
 *
 * Use it anywhere something is processing. `compact` lowers the hop so it fits inside a button or a banner.
 * With Reduce Motion on, the dumpling stays put and gently pulses instead.
 */
export function DumplingLoader({ size = 64, compact, dark, label }: { size?: number; compact?: boolean; dark?: boolean; label?: string }) {
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  const height = size * LOGO_RATIO;
  const hop = size * (compact ? 0.28 : 0.6);

  useEffect(() => {
    t.setValue(0);
    const loop = reduced
      ? Animated.loop(
          Animated.sequence([
            Animated.timing(t, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            Animated.timing(t, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          ]),
        )
      : Animated.loop(Animated.timing(t, { toValue: 1, duration: 1150, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [t, reduced]);

  // Timeline (0 → 1): crouch 0–0.14, rise 0.14–0.5, fall 0.5–0.84, land and settle 0.84–1.
  const motion = reduced
    ? { opacity: t.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }) }
    : {
        transform: [
          { translateY: t.interpolate({ inputRange: [0, 0.14, 0.32, 0.5, 0.68, 0.84, 1], outputRange: [0, size * 0.04, -hop * 0.82, -hop, -hop * 0.82, 0, 0] }) },
          { rotate: t.interpolate({ inputRange: [0, 0.16, 0.82, 1], outputRange: ['0deg', '0deg', '360deg', '360deg'] }) },
          { scaleX: t.interpolate({ inputRange: [0, 0.12, 0.22, 0.84, 0.9, 1], outputRange: [1, 1.12, 0.94, 1, 1.14, 1] }) },
          { scaleY: t.interpolate({ inputRange: [0, 0.12, 0.22, 0.84, 0.9, 1], outputRange: [1, 0.84, 1.08, 1, 0.84, 1] }) },
        ],
      };
  const shadow = reduced
    ? null
    : {
        opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.22, 0.08, 0.22] }),
        transform: [{ scaleX: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.5, 1] }) }],
      };

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? 'Loading'}
      style={{ alignItems: 'center', justifyContent: 'flex-end', width: size * 1.1, height: height + (reduced ? 0 : hop) + size * 0.1 }}>
      {!reduced && (
        <Animated.View
          style={[
            { position: 'absolute', bottom: 0, width: size * 0.7, height: size * 0.1, borderRadius: size, backgroundColor: dark ? Color.nightText : Color.logoInk },
            shadow,
          ]}
        />
      )}
      <Animated.View style={[{ marginBottom: size * 0.05 }, motion]}>
        <DumplingLogo size={size} />
      </Animated.View>
    </View>
  );
}
