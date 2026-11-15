import { useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { DumplingLogo } from '@/components/logo';
import { Color, Font, Stroke } from '@/constants/dumpling';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useElder, useMe, useSession, useToday } from '@/lib/session';
import { useSeen } from '@/lib/seen';
import { api } from '../../convex/_generated/api';

type Props = Omit<TabTriggerSlotProps, 'ref'> & Pick<ComponentProps<typeof Pressable>, 'ref'> & { icon: IconName; dot?: boolean };

function TabButton({ children, isFocused, icon, dot, ...props }: Props) {
  const color = isFocused ? Color.ink : Color.textSoft;
  return (
    <Pressable {...props} accessibilityRole="tab" accessibilityState={{ selected: isFocused }} style={styles.tab}>
      <View style={[styles.tabIcon, isFocused && styles.tabIconOn]}>
        <Icon name={icon} size={22} color={color} />
        {dot && !isFocused && <View style={styles.dot} accessibilityLabel="New" />}
      </View>
      <Text maxFontSizeMultiplier={1.3} style={[styles.label, { color }]}>{children}</Text>
    </Pressable>
  );
}

/** The centre of the bar. Recording is never more than one tap away from anywhere in the app. */
function FoldButton() {
  const reduced = useReducedMotion();
  return (
    <Pressable
      testID="fold-button"
      accessibilityRole="button"
      accessibilityLabel="Fold a Dumpling"
      accessibilityHint="Opens the camera"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        router.push('/fold');
      }}
      style={({ pressed }) => [styles.tab, pressed && reduced && { opacity: 0.7 }]}>
      {({ pressed }) => (
        <>
          <View style={[styles.fold, pressed && !reduced && styles.foldPressed]}>
            <DumplingLogo size={42} />
          </View>
          <Text maxFontSizeMultiplier={1.3} style={[styles.label, { color: Color.ink }]}>Fold</Text>
        </>
      )}
    </Pressable>
  );
}

function useDots() {
  const { auth } = useSession();
  const me = useMe();
  const date = useToday(me?.timeZone);
  const seen = useSeen();
  const week = useQuery(api.today.week, auth && date ? { ...auth, date } : 'skip');
  const feasts = useQuery(api.feasts.list, auth ?? 'skip');
  const todayClips = week?.find((d) => d.date === date)?.clips ?? 0;
  const latestReady = feasts?.find((f) => f.status === 'ready');
  return {
    today: seen.loaded && todayClips > 0 && (seen.date !== date || todayClips > seen.clips),
    feast: seen.loaded && !!latestReady && seen.feastId !== latestReady.id,
  };
}

export default function AppTabs() {
  const insets = useSafeAreaInsets();
  const elder = useElder();
  const dots = useDots();
  return (
    <Tabs style={{ flex: 1 }}>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <View style={StyleSheet.flatten([styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }, elder && { display: 'none' }])}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="today" dot={dots.today}>Today</TabButton>
          </TabTrigger>
          <FoldButton />
          <TabTrigger name="feast" href="/feast" asChild>
            <TabButton icon="feast" dot={dots.feast}>Feast</TabButton>
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 10,
    borderTopWidth: Stroke.line,
    borderColor: Color.ink,
    backgroundColor: Color.surface,
  },
  tab: { flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  tabIcon: { width: 52, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tabIconOn: { backgroundColor: Color.goldSoft, borderWidth: 1.5, borderColor: Color.ink },
  label: { fontSize: 12, fontWeight: '700', fontFamily: Font.brand },
  dot: { position: 'absolute', top: 0, right: 6, width: 12, height: 12, borderRadius: 6, backgroundColor: Color.brand, borderWidth: 2, borderColor: Color.ink },
  fold: { width: 68, height: 56, borderRadius: 20, backgroundColor: Color.logo, borderWidth: Stroke.line, borderBottomWidth: Stroke.lip + 1, borderColor: Color.ink, alignItems: 'center', justifyContent: 'center', marginTop: -24 },
  foldPressed: { borderBottomWidth: Stroke.line, transform: [{ translateY: Stroke.lip + 1 - Stroke.line }] },
});
