import { Nunito_700Bold, Nunito_700Bold_Italic, Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { LoadingSplash } from '@/components/splash';
import { Button, StateView } from '@/components/ui';
import { Color } from '@/constants/dumpling';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useNotificationRouting } from '@/lib/notifications';
import { OutboxProvider } from '@/lib/outbox';
import { SeenProvider } from '@/lib/seen';
import { MeProvider, SessionProvider, useSession } from '@/lib/session';
import { saveMembership, saveValue } from '@/lib/storage';

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

/**
 * Last line of defence. A seat that ends while screens are still open (left on another device, removed, or deleted)
 * makes the server reject every query with "seat … expired". Instead of a crash, forget the seat on this device and
 * start over at Welcome. Anything else shows a calm retry.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const expired = /seat at this Table has expired/i.test(error?.message ?? '');
  useEffect(() => {
    if (!expired) return;
    void Promise.all([saveMembership(null), saveValue('setup', null)]).then(() => retry());
  }, [expired, retry]);
  return (
    <View style={{ flex: 1, backgroundColor: Color.bg, justifyContent: 'center', padding: 20 }}>
      {expired ? (
        <StateView mascot="smile" title="Taking you back to the start" />
      ) : (
        <StateView mascot="wow" title="Something went wrong" body="Try again in a moment." action={<Button label="Try again" onPress={() => void retry()} />} />
      )}
    </View>
  );
}

/** The app, with the animated loading screen laid over it until the session is ready. */
function AppShell() {
  const { ready } = useSession();
  // Nunito ships inside the app bundle, so this resolves in a few milliseconds. A font that fails to load
  // falls back to the system face rather than blocking the app.
  const [fontsLoaded, fontError] = useFonts({ Nunito_700Bold, Nunito_800ExtraBold, Nunito_700Bold_Italic });
  const fontsReady = fontsLoaded || !!fontError;
  const [splash, setSplash] = useState(true);
  // The in-app splash lines up with the native one, so hand over as soon as its words can render in Nunito.
  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync();
  }, [fontsReady]);
  const done = useCallback(() => setSplash(false), []);
  if (!fontsReady) return null;
  return (
    <View style={{ flex: 1, backgroundColor: Color.bg }}>
      <StatusBar style={splash ? 'light' : 'dark'} />
      <RootStack />
      {splash && <LoadingSplash ready={ready} onDone={done} />}
    </View>
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
                <AppShell />
              </ThemeProvider>
            </SeenProvider>
          </OutboxProvider>
        </MeProvider>
      </SessionProvider>
    </ConvexProvider>
  );
}
