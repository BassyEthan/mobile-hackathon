import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { Palette } from '@/constants/dumpling';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: Palette.cream, primary: Palette.accent } };

function RootStack() {
  const reducedMotion = useReducedMotion();
  const { ready, auth } = useSession();
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  return (
    <Stack screenOptions={{ headerShown: false, animation: reducedMotion ? 'none' : 'default', contentStyle: { backgroundColor: Palette.cream } }}>
      <Stack.Protected guard={!auth}>
        <Stack.Screen name="welcome" />
      </Stack.Protected>
      <Stack.Protected guard={!!auth}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="convex-check" />
        <Stack.Screen name="fold" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="player/[id]" options={{ presentation: 'fullScreenModal' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <SessionProvider>
        <ThemeProvider value={theme}>
          <StatusBar style="dark" />
          <RootStack />
        </ThemeProvider>
      </SessionProvider>
    </ConvexProvider>
  );
}
