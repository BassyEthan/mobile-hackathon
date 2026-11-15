import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Mascot } from '@/components/mascot';
import { Steamer } from '@/components/steamer';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { Palette } from '@/constants/dumpling';
import { BottomTabInset } from '@/constants/theme';
import { useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../../convex/_generated/api';

export default function Today() {
  const { token } = useSession();
  const me = useMe();
  const date = useToday(me?.timeZone);
  const today = useQuery(api.today.get, token && date ? { token, date } : 'skip');
  const ensureFilling = useMutation(api.today.ensureFilling);
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (token && date && today && today.filling === null && asked.current !== date) {
      asked.current = date;
      void ensureFilling({ token });
    }
  }, [token, date, today, ensureFilling]);

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

  return (
    <Screen bottomInset={BottomTabInset}>
      <View style={styles.header}>
        <Mascot size={72} />
        <View style={{ flex: 1 }}>
          <Txt variant="label">{me.tableName}</Txt>
          <Txt variant="title">Hi, {me.displayName}</Txt>
        </View>
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
          label="Fold"
          disabled={!today.filling}
          onPress={() => {
            if (!today.filling) return;
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push({ pathname: '/fold', params: { fillingId: today.filling.id, prompt: today.filling.prompt } });
          }}
        />
      )}

      <Steamer members={today.members} lidOff={today.lidOff} dumplings={today.dumplings} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  filling: { backgroundColor: Palette.creamDeep, paddingVertical: 28 },
  centerText: { textAlign: 'center' },
});
