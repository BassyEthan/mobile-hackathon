import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Mascot } from '@/components/mascot';
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

  const folded = today.members.filter((m) => m.folded);

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

      <Button testID="fold-button" big label="Fold" onPress={() => {}} disabled />
      <Txt variant="small" style={styles.centerText}>
        Recording arrives in the next milestone.
      </Txt>

      <Card>
        <Txt variant="label">The Steamer</Txt>
        <Txt testID="steamer-status">
          {folded.length === 0
            ? 'Nobody has folded yet today.'
            : `${folded.map((m) => (m.isMe ? 'You' : m.displayName)).join(', ')} folded today.`}
        </Txt>
        <Txt variant="small">{today.lidOff ? 'The lid is off.' : 'The lid stays on until you fold.'}</Txt>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  filling: { backgroundColor: Palette.creamDeep, paddingVertical: 28 },
  centerText: { textAlign: 'center' },
});
