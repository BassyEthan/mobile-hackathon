import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { AskTheTable } from '@/components/ask-the-table';
import { Mascot } from '@/components/mascot';
import { Steamer } from '@/components/steamer';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { Palette } from '@/constants/dumpling';
import { BottomTabInset } from '@/constants/theme';
import { useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../../convex/_generated/api';

export default function Today() {
  const { auth } = useSession();
  const me = useMe();
  const date = useToday(me?.timeZone);
  const today = useQuery(api.today.get, auth && date ? { ...auth, date } : 'skip');
  const ensureFilling = useMutation(api.today.ensureFilling);
  const asked = useRef<string | null>(null);
  const [sparkIndex, setSparkIndex] = useState(0);

  useEffect(() => {
    if (auth && date && today && today.filling === null && asked.current !== date) {
      asked.current = date;
      void ensureFilling({ ...auth });
    }
  }, [auth, date, today, ensureFilling]);

  if (!me || !today) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <Mascot size={110} />
          <Txt variant="small">Warming the steamer…</Txt>
        </View>
      </Screen>
    );
  }

  const days = date ? (7 - new Date(`${date}T12:00:00Z`).getUTCDay()) % 7 : null;
  const countdown = days === 0 ? 'Feast day' : days === 1 ? 'Feast tomorrow' : `Feast in ${days} days`;
  const sparks = today.filling?.sparks ?? [];
  const spark = sparks[sparkIndex % Math.max(1, sparks.length)];
  const canShare = Platform.OS !== 'web' || (typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  const invite = `Join ${me.tableName} in Dumpling with Table code ${me.joinCode}.`;

  const shareCode = async () => {
    try {
      if (Platform.OS === 'web') await navigator.share({ text: invite });
      else await Share.share({ message: invite });
    } catch {
      // The selectable code stays visible if sharing is dismissed or unavailable.
    }
  };

  return (
    <Screen bottomInset={BottomTabInset}>
      <View style={styles.header}>
        <Mascot size={72} />
        <View style={{ flex: 1 }}>
          <Txt variant="label">{me.tableName}</Txt>
          <Txt variant="title">Hi, {me.displayName}</Txt>
        </View>
      </View>

      <Button
        testID="fold-button"
        big
        label="Fold a Dumpling"
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          router.push('/fold');
        }}
      />

      {today.members.length === 1 && (
        <Card>
          <Txt variant="label">Invite your family</Txt>
          <Txt variant="title" selectable>{me.joinCode}</Txt>
          {canShare && (
            <Button kind="secondary" label="Share Table code" onPress={() => void shareCode()} />
          )}
        </Card>
      )}

      <View style={styles.tableStats}>
        <Txt variant="small" testID="table-week">Table week {today.week}</Txt>
        {days !== null && <Txt variant="small" testID="feast-countdown">{countdown}</Txt>}
      </View>

      <Card style={styles.spark}>
        <Txt variant="label">Today&apos;s spark</Txt>
        <Txt variant="hero" testID="spark-text">
          {spark?.text ?? 'Fold anything you like today.'}
        </Txt>
        {spark?.type === 'sealed' && <Txt variant="small" testID="spark-sealed">Sealed until the Sunday Feast.</Txt>}
        {spark?.key === 'primary' && today.filling?.authorName && (
          <Txt variant="small" testID="spark-author">
            Asked by {today.filling.authorName}{today.filling.addressedToName ? ` for ${today.filling.addressedToName}` : ''}
          </Txt>
        )}
        {today.filling && spark && (
          <View style={styles.sparkActions}>
            <View style={{ flex: 1 }}>
              <Button testID="next-spark" kind="secondary" label="Need a spark?" onPress={() => setSparkIndex((i) => (i + 1) % sparks.length)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="fold-spark"
                label="Fold this"
                onPress={() => {
                  if (!today.filling) return;
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push({ pathname: '/fold', params: { fillingId: today.filling.id, sparkKey: spark.key, prompt: spark.text } });
                }}
              />
            </View>
          </View>
        )}
      </Card>

      {date && <AskTheTable date={date} members={today.members} />}

      <Steamer members={today.members} lidOff={today.lidOff} dumplings={today.dumplings} />

      {today.members.length > 1 && (
        <Card>
          <Txt variant="small" selectable>Table code {me.joinCode}</Txt>
          {canShare && <Button kind="secondary" label="Share Table code" onPress={() => void shareCode()} />}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  spark: { backgroundColor: Palette.creamDeep, paddingVertical: 24 },
  sparkActions: { flexDirection: 'row', gap: 10 },
  tableStats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  centerText: { textAlign: 'center' },
});
