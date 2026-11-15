import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

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

  const iFolded = today.members.some((m) => m.isMe && m.folded);
  const days = date ? (7 - new Date(`${date}T12:00:00Z`).getUTCDay()) % 7 : null;
  const countdown = days === 0 ? 'Feast day' : days === 1 ? 'Feast tomorrow' : `Feast in ${days} days`;
  const streak = today.streak ?? 0;
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
        {days !== null && <Txt variant="small" testID="feast-countdown">{countdown}</Txt>}
        <Txt variant="small" testID="table-streak">
          {streak > 0 ? `Table streak · ${streak} ${streak === 1 ? 'week' : 'weeks'}` : 'Your first Feast starts the Table streak.'}
        </Txt>
      </View>

      <Card style={styles.filling}>
        <Txt variant="label">Today&apos;s Filling</Txt>
        <Txt variant="hero" testID="filling-prompt">
          {today.filling?.prompt ?? 'Rolling out the dough…'}
        </Txt>
      </Card>

      {iFolded ? (
        <Txt variant="small" style={styles.centerText}>
          You folded today. See you tomorrow.
        </Txt>
      ) : (
        <Button
          testID="fold-button"
          big
          label="Fold a Dumpling"
          disabled={!today.filling}
          onPress={() => {
            if (!today.filling) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push({ pathname: '/fold', params: { fillingId: today.filling.id, prompt: today.filling.prompt } });
          }}
        />
      )}

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
  filling: { backgroundColor: Palette.creamDeep, paddingVertical: 28 },
  tableStats: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  centerText: { textAlign: 'center' },
});
