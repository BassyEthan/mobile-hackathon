import { useMutation, useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Icon } from '@/components/icon';
import { ConvexError } from 'convex/values';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Screen, Txt } from '@/components/ui';
import { Palette } from '@/constants/dumpling';
import { BottomTabInset } from '@/constants/theme';
import { useSession } from '@/lib/session';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

function formatWeek(weekOf: string) {
  const [y, m, d] = weekOf.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function FeastCover({ url, onPlay }: { url: string; onPlay: () => void }) {
  const player = useVideoPlayer(url);
  return <Pressable accessibilityRole="button" accessibilityLabel="Play this family Feast" onPress={onPlay} style={{ alignSelf: 'stretch', aspectRatio: 4 / 3, borderRadius: 12, overflow: 'hidden' }}>
    <VideoView player={player} nativeControls={false} contentFit="cover" style={StyleSheet.absoluteFill} />
    <View style={{ position: 'absolute', bottom: 16, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}><Icon name="play" color={Palette.card} /></View>
  </Pressable>;
}

export default function Feast() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { auth } = useSession();
  const feasts = useQuery(api.feasts.list, auth ?? 'skip');
  const cook = useMutation(api.feasts.cook);
  const retry = useMutation(api.feasts.retry);
  const play = (id: Id<'feasts'>) => router.push({ pathname: '/player/[id]', params: { id } });

  const current = feasts?.[0];
  const episode = useQuery(api.feasts.get, auth && current?.status === 'ready' ? { ...auth, feastId: current.id } : 'skip');
  const coverClip = episode?.segments.find((segment) => segment.type === 'clip' && segment.dumpling.mediaType === 'video');
  const coverMedia = coverClip?.type === 'clip' ? coverClip.dumpling : null;
  if (!feasts) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={Palette.accent} />
        </View>
      </Screen>
    );
  }

  const run = async (operation: () => Promise<unknown>) => { setBusy(true); setError(null); try { await operation(); } catch (e) { setError(e instanceof ConvexError ? String(e.data) : 'The Chef could not start. Please try again.'); } finally { setBusy(false); } };

  const [latest, ...leftovers] = feasts;
  const cooking = feasts.some((f) => f.status === 'cooking');

  return (
    <Screen bottomInset={BottomTabInset}>
      <View style={{ gap: 8 }}><Txt variant="hero">Your family album.</Txt><Txt variant="small">A week of little things. Yours to keep.</Txt></View>
      {latest ? (
        <Card style={styles.hero}>
          {coverMedia?.url && <FeastCover url={coverMedia.url} onPlay={() => play(latest.id)} /> }
          <Txt variant="small">Week of {formatWeek(latest.weekOf)}</Txt>
          <Txt variant="hero" style={{ textAlign: 'left', alignSelf: 'stretch' }} testID="latest-feast-title">
            {latest.title}
          </Txt>
          {latest.status === 'ready' && (
            <View style={{ alignSelf: 'stretch' }}>
              <Button testID="play-feast" icon="play" label="Play the Feast" onPress={() => play(latest.id)} />
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
              <Button label="Try again" busy={busy} onPress={() => auth && void run(() => retry({ ...auth, feastId: latest.id }))} />
            </>
          )}
        </Card>
      ) : (
        <Card style={styles.hero}>

          <Txt variant="title">Your first Feast starts here</Txt>
          <Txt style={{ textAlign: 'center', color: Palette.inkSoft }}>Fold a few moments, then let the Chef bring them together. You can try a first episode before Sunday.</Txt>
        </Card>
      )}

      <Button
        testID="cook-now"
        kind="quiet"
        icon="feast"
        busy={busy}
        label={cooking ? 'Cooking…' : 'Cook the Feast now'}
        disabled={cooking}
        onPress={() => auth && void run(() => cook({ ...auth }))}
      />

      {error && <Txt style={{ color: Palette.danger }}>{error}</Txt>}
      <View style={{ gap: 6 }}><Txt variant="title">Leftovers</Txt><Txt variant="small">Good moments are worth coming back to.</Txt></View>
      {leftovers.length === 0 && <Txt variant="small">Your past episodes will find a home here.</Txt>}
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
          <Icon name={f.status === 'ready' ? 'play' : 'feast'} color={Palette.accentDeep} />
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hero: { alignItems: 'flex-start', gap: 16, paddingVertical: 0, paddingBottom: 24 },
  cooking: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  leftover: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderColor: Palette.creamDeep,
  },
});
