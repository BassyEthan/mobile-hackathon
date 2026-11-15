import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { DumplingCard, type RevealedDumpling } from '@/components/dumpling-card';
import { Mascot } from '@/components/mascot';
import { Card, Txt } from '@/components/ui';
import { Palette } from '@/constants/dumpling';

type Member = { id: string; displayName: string; folded: boolean; isMe: boolean };

function Reveal({ index, children }: { index: number; children: React.ReactNode }) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 520,
      delay: 140 * index,
      easing: Easing.out(Easing.back(1.4)),
      useNativeDriver: true,
    }).start();
  }, [index, progress]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
        ],
      }}>
      {children}
    </Animated.View>
  );
}

export function Steamer({ members, lidOff, dumplings }: { members: Member[]; lidOff: boolean; dumplings: RevealedDumpling[] }) {
  const wasOn = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasOn.current === true && lidOff) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    wasOn.current = !lidOff;
  }, [lidOff]);

  const folded = members.filter((m) => m.folded);
  return (
    <View style={{ gap: 14 }}>
      <Card>
        <Txt variant="label">The Steamer</Txt>
        <View style={styles.seats}>
          {members.map((m) => (
            <View key={m.id} style={styles.seat}>
              <View style={[styles.avatar, m.folded && styles.avatarFolded]}>
                <Text style={[styles.initial, m.folded && { color: Palette.cream }]}>{m.displayName.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Txt variant="small" numberOfLines={1}>
                {m.isMe ? 'You' : m.displayName}
              </Txt>
            </View>
          ))}
        </View>
        <Txt testID="steamer-status">
          {folded.length === 0
            ? 'Nobody has folded yet. The steamer is warm.'
            : `${folded.length} of ${members.length} folded today.`}
        </Txt>
      </Card>
      {!lidOff ? (
        <Card style={styles.lid}>
          <Mascot size={90} />
          <Txt variant="title" style={{ textAlign: 'center' }}>
            The lid is on
          </Txt>
          <Txt style={{ textAlign: 'center', color: Palette.inkSoft }}>Fold today&apos;s Filling to see everyone&apos;s.</Txt>
        </Card>
      ) : (
        dumplings.map((d, i) => (
          <Reveal key={d.id} index={i}>
            <DumplingCard dumpling={d} />
          </Reveal>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  seat: { alignItems: 'center', width: 62, gap: 4 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: Palette.creamDeep, alignItems: 'center', justifyContent: 'center' },
  avatarFolded: { backgroundColor: Palette.accent },
  initial: { fontSize: 22, fontWeight: '800', color: Palette.inkSoft },
  lid: { alignItems: 'center', paddingVertical: 28, backgroundColor: Palette.creamDeep },
});
