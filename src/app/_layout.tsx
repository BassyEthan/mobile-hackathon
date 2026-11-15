import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Color } from '@/constants/dumpling';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useNotificationRouting } from '@/lib/notifications';
import { OutboxProvider } from '@/lib/outbox';
import { SeenProvider } from '@/lib/seen';
import { MeProvider, SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, {
  unsavedChangesWarning: false,
});

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: Color.bg, primary: Color.brand } };

function RootStack() {
  const reducedMotion = useReducedMotion();
  const { ready, auth, setup } = useSession();
  const seated = !!auth && !setup;
  useNotificationRouting(seated);
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;
  const modal = { presentation: 'fullScreenModal' as const, animation: reducedMotion ? ('none' as const) : ('slide_from_bottom' as const) };
  return (
    <Stack screenOptions={{ headerShown: false, animation: reducedMotion ? 'none' : 'default', contentStyle: { backgroundColor: Color.bg } }}>
      {/* A guest link signs a grandparent straight into the Feast; it works whether or not anyone is signed in. */}
      <Stack.Screen name="watch" />
      <Stack.Protected guard={!auth}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="start" />
        <Stack.Screen name="join/[code]" />
      </Stack.Protected>
      <Stack.Protected guard={!!auth && !!setup}>
        <Stack.Screen name="setup" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={seated}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="table" />
        <Stack.Screen name="member/[id]" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="convex-check" />
        <Stack.Screen name="fold" options={modal} />
        <Stack.Screen name="clip/[id]" options={{ ...modal, contentStyle: { backgroundColor: Color.night } }} />
        <Stack.Screen name="player/[id]" options={{ ...modal, contentStyle: { backgroundColor: Color.night } }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <SessionProvider>
        <MeProvider>
          <OutboxProvider>
            <SeenProvider>
              <ThemeProvider value={theme}>
                <StatusBar style="dark" />
                <RootStack />
              </ThemeProvider>
            </SeenProvider>
          </OutboxProvider>
        </MeProvider>
      </SessionProvider>
    </ConvexProvider>
  );
}
