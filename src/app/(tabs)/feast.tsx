import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Mascot } from '@/components/mascot';
import { Button, Card, Screen, Txt } from '@/components/ui';
import { Palette, Radius } from '@/constants/dumpling';
import { BottomTabInset } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

function formatWeek(weekOf: string) {
  const [y, m, d] = weekOf.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

export default function Feast() {
  const { auth } = useSession();
  const feasts = useQuery(api.feasts.list, auth ?? 'skip');
  const cook = useMutation(api.feasts.cook);
  const retry = useMutation(api.feasts.retry);
  const play = (id: Id<'feasts'>) => router.push({ pathname: '/player/[id]', params: { id } });

  if (!feasts) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={Palette.accent} />
        </View>
      </Screen>
    );
  }

  const [latest, ...leftovers] = feasts;
  const cooking = feasts.some((f) => f.status === 'cooking');

  return (
    <Screen bottomInset={BottomTabInset}>
      <Txt variant="label">Sunday Feast</Txt>
      {latest ? (
        <Card style={styles.hero}>
          <Mascot size={96} steaming={latest.status !== 'failed'} mood={latest.status === 'cooking' ? 'wow' : 'smile'} />
          <Txt variant="small">Week of {formatWeek(latest.weekOf)}</Txt>
          <Txt variant="hero" style={{ textAlign: 'center' }} testID="latest-feast-title">
            {latest.title}
          </Txt>
          {latest.status === 'ready' && (
            <View style={{ alignSelf: 'stretch' }}>
              <Button testID="play-feast" big label="Play" onPress={() => play(latest.id)} />
            </View>
          )}
          {latest.status === 'cooking' && (
            <View style={styles.cooking}>
              <ActivityIndicator color={Palette.accent} />
              <Txt>The Chef is cooking. This takes about a minute.</Txt>
            </View>
          )}
          {latest.status === 'failed' && (
            <>
              <Txt style={{ color: Palette.danger, textAlign: 'center' }}>{latest.error ?? 'Something burned.'}</Txt>
              <Button label="Try again" onPress={() => auth && void retry({ ...auth, feastId: latest.id })} />
            </>
          )}
        </Card>
      ) : (
        <Card style={styles.hero}>
          <Mascot size={96} />
          <Txt variant="title">No Feast yet</Txt>
          <Txt style={{ textAlign: 'center', color: Palette.inkSoft }}>Try a Pilot with Cook the Feast now, or fold through the week for Sunday.</Txt>
        </Card>
      )}

      <Button
        testID="cook-now"
        kind="secondary"
        label={cooking ? 'Cooking…' : 'Cook the Feast now'}
        disabled={cooking}
        onPress={() => auth && void cook({ ...auth })}
      />

      {leftovers.length > 0 && <Txt variant="label">Leftovers</Txt>}
      {leftovers.map((f) => (
        <Pressable
          key={f.id}
          accessibilityRole="button"
          disabled={f.status !== 'ready'}
          onPress={() => play(f.id)}
          style={({ pressed }) => [styles.leftover, pressed && { opacity: 0.7 }]}>
          <View style={{ flex: 1 }}>
            <Txt variant="small">Week of {formatWeek(f.weekOf)}</Txt>
            <Txt numberOfLines={2}>{f.title}</Txt>
          </View>
          <Txt variant="title" style={{ color: Palette.accent }}>
            {f.status === 'ready' ? '▶︎' : f.status === 'cooking' ? '…' : '!'}
          </Txt>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'center', gap: 12, paddingVertical: 28 },
  cooking: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  leftover: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Palette.card,
    borderRadius: Radius.card,
    padding: 20,
    borderWidth: 1,
    borderColor: Palette.creamDeep,
  },
});
