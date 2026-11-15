import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { DumplingCard, type RevealedDumpling } from '@/components/dumpling-card';
import { Card, Txt } from '@/components/ui';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { Palette } from '@/constants/dumpling';

type Member = { id: string; displayName: string; folded: boolean; isMe: boolean };

function Reveal({ index, children }: { index: number; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 0 : 260,
      delay: reduced ? 0 : Math.min(index, 3) * 50,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [index, progress, reduced]);
  return (
    <Animated.View
      style={{
        opacity: progress,
        transform: [
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.99, 1] }) },
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

  const folded = members.filter((m) => m.folded).map((m) => (m.isMe ? 'You' : m.displayName));
  const inLine = folded.length === 0
    ? 'The steamer is warm.'
    : `${folded.length === 1 ? folded[0] : `${folded.slice(0, -1).join(', ')} and ${folded[folded.length - 1]}`} ${folded.length === 1 && folded[0] !== 'You' ? 'is' : 'are'} in.`;
  const shown = new Set(dumplings.map((d) => d.id));
  const replies = new Map<string, RevealedDumpling[]>();
  for (const d of dumplings) {
    if (d.replyTo && shown.has(d.replyTo)) replies.set(d.replyTo, [...(replies.get(d.replyTo) ?? []), d]);
  }
  const roots = dumplings.filter((d) => !d.replyTo || !shown.has(d.replyTo));
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 12 }}>
        <Txt variant="title">Around the Table</Txt>
        <View style={styles.seats}>
          {members.map((m) => (
            <View key={m.id} style={styles.seat}>
              <View style={[styles.avatar, m.folded && styles.avatarFolded]}>
                <Text style={[styles.initial, m.folded && { color: Palette.cream }]}>{m.displayName.slice(0, 1).toUpperCase()}</Text>
              </View>
              <Txt variant="small" numberOfLines={2}>
                {m.isMe ? 'You' : m.displayName}
              </Txt>
            </View>
          ))}
        </View>
        <Txt testID="steamer-status">{inLine}</Txt>
      </View>
      {!lidOff ? (
        <Card style={styles.lid}>
          
          <Txt variant="title" style={{ textAlign: 'center' }}>
            Your day belongs here.
          </Txt>
          <Txt style={{ textAlign: 'center', color: Palette.inkSoft }}>
            Share anything from your day to see your family’s moments. No spark needed.
          </Txt>
        </Card>
      ) : (
        roots.map((d, i) => (
          <Reveal key={d.id} index={i}>
            <DumplingCard dumpling={d} replies={replies} />
          </Reveal>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  seat: { alignItems: 'center', width: 72, gap: 4 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Palette.creamDeep, alignItems: 'center', justifyContent: 'center' },
  avatarFolded: { backgroundColor: Palette.inkSoft },
  initial: { fontSize: 16, fontWeight: '600', color: Palette.inkSoft },
  lid: { alignItems: 'center', paddingVertical: 32 },
});
