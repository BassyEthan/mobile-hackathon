import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { LOGO_RATIO } from '@/components/logo';
import { Mascot } from '@/components/mascot';
import { Color, Font, Space } from '@/constants/dumpling';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

/** Must match `imageWidth` for expo-splash-screen in app.json so the native splash hands over seamlessly. */
export const SPLASH_LOGO = 168;
const LOGO_H = SPLASH_LOGO * LOGO_RATIO;

/** Three dots that rise in turn, like a pot coming to the boil. */
function SimmerDots({ reduced }: { reduced: boolean }) {
  const [dots] = useState(() => [0, 1, 2].map(() => new Animated.Value(0)));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.stagger(
        160,
        dots.map((d) =>
          Animated.sequence([
            Animated.timing(d, { toValue: 1, duration: 320, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(d, { toValue: 0, duration: 320, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.delay(280),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [dots, reduced]);
  return (
    <View style={styles.dots}>
      {dots.map((d, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }), transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) }] },
          ]}
        />
      ))}
    </View>
  );
}

/**
 * The first thing anyone sees. It picks up exactly where the native splash leaves off (same orange, same logo,
 * same position), then the dumpling settles in, steams, and the whole screen lifts away once the app is ready.
 */
export function LoadingSplash({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const reduced = useReducedMotion();
  const [intro] = useState(() => new Animated.Value(0));
  const [bob] = useState(() => new Animated.Value(0));
  const [exit] = useState(() => new Animated.Value(0));
  const [minimumShown, setMinimumShown] = useState(false);

  // Words fade in under the logo, then the dumpling breathes gently while we wait.
  useEffect(() => {
    Animated.timing(intro, { toValue: 1, duration: reduced ? 0 : 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, intro, reduced]);

  // Long enough to register the brand, short enough never to feel like a wait.
  useEffect(() => {
    const t = setTimeout(() => setMinimumShown(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready || !minimumShown) return;
    const duration = reduced ? 150 : 420;
    Animated.timing(exit, { toValue: 1, duration, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    // Leave on a timer rather than the animation callback, so an interrupted animation can never trap anyone here.
    const t = setTimeout(onDone, duration + 60);
    return () => clearTimeout(t);
  }, [ready, minimumShown, exit, onDone, reduced]);

  const logoMotion = {
    transform: [
      { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
      { scaleX: bob.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985] }) },
      { scaleY: bob.interpolate({ inputRange: [0, 1], outputRange: [1, 1.02] }) },
      { scale: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
    ],
  };

  return (
    <Animated.View
      pointerEvents={ready ? 'none' : 'auto'}
      accessibilityLabel="Dumpling is loading"
      accessibilityRole="progressbar"
      style={[StyleSheet.absoluteFill, styles.root, { opacity: exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]}>
      <Animated.View style={[{ width: SPLASH_LOGO, height: LOGO_H }, logoMotion]}>
        <View style={{ position: 'absolute', bottom: 0 }}>
          <Mascot size={SPLASH_LOGO} steamColor={Color.logoCream} steaming />
        </View>
      </Animated.View>
      <Animated.View
        style={[
          styles.words,
          { marginTop: LOGO_H / 2 + Space.xl },
          { opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
        ]}>
        <Text maxFontSizeMultiplier={1.3} style={styles.wordmark}>Dumpling</Text>
        <Text maxFontSizeMultiplier={1.4} style={styles.tagline}>Gathering your family…</Text>
        <SimmerDots reduced={reduced} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: Color.logo, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  words: { position: 'absolute', top: '50%', left: 0, right: 0, alignItems: 'center', gap: Space.xs },
  wordmark: { fontFamily: Font.display, fontSize: 44, lineHeight: 52, fontWeight: '800', letterSpacing: -0.6, color: Color.logoCream },
  tagline: { fontFamily: Font.italic, fontStyle: 'italic', fontWeight: '700', fontSize: 17, lineHeight: 23, color: Color.logoInk },
  dots: { flexDirection: 'row', gap: 8, marginTop: Space.md, height: 16, alignItems: 'flex-end' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Color.logoCream },
});
