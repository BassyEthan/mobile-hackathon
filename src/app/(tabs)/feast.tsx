import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { ConvexError } from 'convex/values';
import { router, useFocusEffect, type ErrorBoundaryProps } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TableHeader } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { Mascot } from '@/components/mascot';
import { Button, LinkButton, Loading, Screen, SectionHeader, StateView, Txt } from '@/components/ui';
import { Color, Font, Radius, Space, feastTimeLabel } from '@/constants/dumpling';
import { useSeen } from '@/lib/seen';
import { longDate, useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

type FeastRow = FunctionReturnType<typeof api.feasts.list>[number];

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <StateView icon="retry" title="The Feast did not load" body="Check your connection, then try again." action={<Button label="Try again" onPress={() => void retry()} />} />
      </View>
    </Screen>
  );
}

const play = (id: Id<'feasts'>) => router.push({ pathname: '/player/[id]', params: { id } });

function Cover({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.muted = true;
  });
  return <VideoView player={player} nativeControls={false} contentFit="cover" style={StyleSheet.absoluteFill} />;
}

function daysUntilSunday(date: string) {
  return (7 - new Date(`${date}T12:00:00Z`).getUTCDay()) % 7;
}

function countdown(date: string, hour: number) {
  const days = daysUntilSunday(date);
  const at = feastTimeLabel(hour);
  return days === 0 ? `Tonight at ${at}` : days === 1 ? `Tomorrow at ${at}` : `Sunday at ${at}, in ${days} days`;
}

function monthOf(weekOf: string) {
  return new Date(`${weekOf}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function HeroFeast({ feast, busy, onRetry }: { feast: FeastRow; busy: boolean; onRetry: () => void }) {
  const { auth } = useSession();
  const episode = useQuery(api.feasts.get, auth && feast.status === 'ready' ? { ...auth, feastId: feast.id } : 'skip');
  const cover = episode?.segments.find((s) => s.type === 'clip' && s.dumpling.mediaType === 'video');
  const coverUrl = cover?.type === 'clip' ? cover.dumpling.url : null;
  const label = feast.kind === 'banquet' ? 'Monthly Banquet' : feast.kind === 'reunion' ? 'Yearly Reunion' : feast.isPilot ? 'Your Pilot' : 'Sunday Feast';

  if (feast.status === 'cooking') {
    return (
      <View style={styles.hero} testID="feast-cooking">
        <View style={[styles.heroArt, { alignItems: 'center', justifyContent: 'center' }]}>
          <Mascot size={96} />
        </View>
        <View style={styles.heroBody}>
          <Txt variant="eyebrow">{label} · Week {feast.weekNumber}</Txt>
          <Txt variant="title">The Chef is cooking</Txt>
          <Txt variant="meta">Your family’s week is being stitched together. This takes about a minute; you can leave and come back.</Txt>
        </View>
      </View>
    );
  }
  if (feast.status === 'failed') {
    return (
      <View style={styles.hero} testID="feast-failed">
        <View style={styles.heroBody}>
          <Txt variant="eyebrow">{label} · Week {feast.weekNumber}</Txt>
          <Txt variant="title">This Feast burned</Txt>
          <Txt variant="meta">{feast.error ?? 'Something went wrong in the kitchen.'} Your clips are safe.</Txt>
          <Button icon="retry" label="Cook it again" busy={busy} onPress={onRetry} />
        </View>
      </View>
    );
  }
  return (
    <View testID="latest-feast" style={styles.hero}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Play ${feast.title}`} onPress={() => play(feast.id)} style={({ pressed }) => [styles.heroArt, pressed && { opacity: 0.92 }]}>
        {coverUrl ? <Cover url={coverUrl} /> : <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Mascot size={96} steaming={false} /></View>}
        <View style={styles.heroOverlay}>
          <Text style={styles.heroLabel}>{label} · Week {feast.weekNumber}</Text>
          <Text style={styles.heroTitle} numberOfLines={3} testID="latest-feast-title">{feast.title}</Text>
          <Text style={styles.heroMeta}>Week of {longDate(feast.weekOf)}</Text>
        </View>
      </Pressable>
      <View style={styles.heroBody}>
        <Button testID="play-feast" icon="play" label="Play the Feast" onPress={() => play(feast.id)} />
      </View>
    </View>
  );
}

function LeftoverRow({ feast }: { feast: FeastRow }) {
  const ready = feast.status === 'ready';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${feast.title}, week ${feast.weekNumber}`}
      accessibilityState={{ disabled: !ready }}
      disabled={!ready}
      onPress={() => play(feast.id)}
      style={({ pressed }) => [styles.leftover, pressed && { opacity: 0.6 }]}>
      <View style={styles.weekBadge}>
        <Text style={styles.weekNum}>{feast.weekNumber}</Text>
        <Text style={styles.weekLabel}>Week</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="callout" numberOfLines={2} style={{ fontWeight: '600' }}>{feast.title}</Txt>
        <Txt variant="meta">{ready ? `Week of ${longDate(feast.weekOf)}` : feast.status === 'cooking' ? 'Cooking…' : 'Did not cook'}</Txt>
      </View>
      {ready && <Icon name="play" size={18} color={Color.brandDeep} />}
    </Pressable>
  );
}

function Freezer({ date }: { date: string }) {
  const { auth } = useSession();
  const pick = useQuery(api.feasts.freezer, auth ? { ...auth, date } : 'skip');
  if (!pick) return null;
  const d = pick.dumpling;
  return (
    <Pressable
      testID="freezer"
      accessibilityRole="button"
      accessibilityLabel={`From the Freezer: ${d.memberName}, ${longDate(pick.date)}`}
      onPress={() => router.push({ pathname: '/clip/[id]', params: { id: d.id, date: pick.date } })}
      style={({ pressed }) => [styles.freezer, pressed && { opacity: 0.85 }]}>
      <View style={styles.freezerThumb}>
        {d.mediaType === 'video' && d.url ? <Cover url={d.url} /> : <Icon name="voice" size={22} color={Color.brandDeep} />}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="freezer" size={14} color={Color.brandDeep} />
          <Txt variant="eyebrow">From the Freezer</Txt>
        </View>
        <Txt variant="callout" style={{ fontWeight: '600' }}>{d.memberName}, {longDate(pick.date)}</Txt>
        {d.caption && <Txt variant="meta" numberOfLines={2}>{d.caption}</Txt>}
      </View>
    </Pressable>
  );
}

export default function Feast() {
  const { auth } = useSession();
  const me = useMe();
  const date = useToday(me?.timeZone);
  const feasts = useQuery(api.feasts.list, auth ?? 'skip');
  const upcoming = useQuery(api.feasts.upcoming, auth && date ? { ...auth, date } : 'skip');
  const cook = useMutation(api.feasts.cook);
  const retry = useMutation(api.feasts.retry);
  const { markFeast } = useSeen();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const latestReady = feasts?.find((f) => f.status === 'ready');
  useFocusEffect(useCallback(() => {
    if (latestReady) markFeast(latestReady.id);
  }, [latestReady, markFeast]));

  if (!feasts || !date || !me) {
    return (
      <Screen scroll={false} header={<TableHeader />}>
        <Loading />
      </Screen>
    );
  }

  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'The Chef could not start. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const weekly = feasts.filter((f) => f.kind === 'weekly');
  const pinned = feasts.filter((f) => f.kind !== 'weekly' && f.status === 'ready');
  const current = weekly.find((f) => f.weekOf === upcoming?.weekOf && f.status !== 'ready');
  const hero = current ?? weekly.find((f) => f.status === 'ready') ?? null;
  const leftovers = weekly.filter((f) => f.id !== hero?.id);
  const months = new Map<string, FeastRow[]>();
  for (const f of leftovers) months.set(monthOf(f.weekOf), [...(months.get(monthOf(f.weekOf)) ?? []), f]);
  const cooking = feasts.some((f) => f.status === 'cooking');
  const thisWeekReady = weekly.some((f) => f.weekOf === upcoming?.weekOf && f.status === 'ready');

  return (
    <Screen header={<TableHeader />} gap={Space.xl}>
      <Txt variant="display">Feast</Txt>

      {pinned.length > 0 && (
        <View style={{ gap: Space.sm }}>
          {pinned.map((f) => (
            <Pressable key={f.id} accessibilityRole="button" onPress={() => play(f.id)} style={({ pressed }) => [styles.pinned, pressed && { opacity: 0.8 }]}>
              <Icon name="award" size={20} color={Color.goldDeep} />
              <View style={{ flex: 1 }}>
                <Txt variant="eyebrow" style={{ color: Color.goldDeep }}>{f.kind === 'banquet' ? 'Monthly Banquet' : 'Yearly Reunion'}</Txt>
                <Txt variant="callout" style={{ fontWeight: '600' }} numberOfLines={1}>{f.title}</Txt>
              </View>
              <Icon name="play" size={18} color={Color.goldDeep} />
            </Pressable>
          ))}
        </View>
      )}

      {hero ? (
        <HeroFeast feast={hero} busy={busy} onRetry={() => auth && void run(() => retry({ ...auth, feastId: hero.id }))} />
      ) : (
        <View style={styles.hero} testID="feast-empty">
          <View style={[styles.heroArt, { alignItems: 'center', justifyContent: 'center', aspectRatio: 16 / 9 }]}>
            <Mascot size={88} />
          </View>
          <View style={styles.heroBody}>
            <Txt variant="eyebrow">Sunday Feast</Txt>
            <Txt variant="title">Your first Feast is on its way</Txt>
            <Txt variant="meta">Every Sunday the Chef turns your family’s week of Folds into a short show. Fold a few moments, or cook a Pilot now to see how it works.</Txt>
          </View>
        </View>
      )}

      {upcoming && !thisWeekReady && (
        <View style={styles.countdown} testID="feast-countdown">
          <Icon name="clock" size={20} color={Color.brandDeep} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="callout" style={{ fontWeight: '600' }}>Next Feast: {countdown(date, upcoming.feastHour)}</Txt>
            <Txt variant="meta" testID="sealed-waiting">
              {upcoming.sealedWaiting > 0
                ? `${upcoming.sealedWaiting} sealed ${upcoming.sealedWaiting === 1 ? 'clip is' : 'clips are'} waiting to be opened`
                : `${upcoming.clipsThisWeek} ${upcoming.clipsThisWeek === 1 ? 'moment' : 'moments'} folded this week`}
            </Txt>
          </View>
        </View>
      )}

      {!thisWeekReady && !cooking && (
        <LinkButton testID="cook-now" icon="feast" label={feasts.length === 0 ? 'Cook a Pilot now' : 'Cook this week’s Feast early'} onPress={() => auth && void run(() => cook({ ...auth }))} />
      )}
      {error && <Txt variant="meta" style={{ color: Color.danger }}>{error}</Txt>}

      {date && <Freezer date={date} />}

      <View style={{ gap: Space.md }}>
        <SectionHeader title="Leftovers" detail="Every Feast your family has shared." />
        {leftovers.length === 0 ? (
          <Txt variant="meta">Past Feasts will be kept here, newest first.</Txt>
        ) : (
          [...months.entries()].map(([month, rows]) => (
            <View key={month} style={{ gap: Space.xs }}>
              <Txt variant="meta" style={{ marginTop: Space.sm }}>{month}</Txt>
              {rows.map((f) => <LeftoverRow key={f.id} feast={f} />)}
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Color.surface, borderWidth: 1, borderColor: Color.border },
  heroArt: { aspectRatio: 4 / 5, maxHeight: 460, backgroundColor: Color.surface2, overflow: 'hidden' },
  heroOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Space.xl, gap: Space.xs, backgroundColor: 'rgba(23,17,14,0.45)' },
  heroLabel: { color: Color.goldSoft, fontSize: 13, fontWeight: '600', fontFamily: Font.ui },
  heroTitle: { color: Color.nightText, fontSize: 28, lineHeight: 33, fontWeight: '600', fontFamily: Font.brand },
  heroMeta: { color: Color.nightSoft, fontSize: 13, fontWeight: '500', fontFamily: Font.ui },
  heroBody: { padding: Space.lg, gap: Space.sm },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.xs },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.lg, borderRadius: Radius.tile, backgroundColor: Color.goldSoft },
  freezer: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.card, backgroundColor: Color.surface, borderWidth: 1, borderColor: Color.border },
  freezerThumb: { width: 72, height: 90, borderRadius: Radius.chip, overflow: 'hidden', backgroundColor: Color.surface2, alignItems: 'center', justifyContent: 'center' },
  leftover: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingVertical: Space.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: Color.border, minHeight: 64 },
  weekBadge: { width: 48, height: 48, borderRadius: Radius.chip, backgroundColor: Color.surface2, alignItems: 'center', justifyContent: 'center' },
  weekNum: { fontSize: 17, fontWeight: '600', color: Color.text, fontFamily: Font.brand },
  weekLabel: { fontSize: 10, fontWeight: '600', color: Color.textSoft, fontFamily: Font.ui },
});
