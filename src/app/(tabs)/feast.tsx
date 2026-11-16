import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { ConvexError } from 'convex/values';
import { router, useFocusEffect, type ErrorBoundaryProps } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TableHeader } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { DumplingLoader } from '@/components/loader';
import { Mascot } from '@/components/mascot';
import { Button, LinkButton, Loading, Screen, SectionHeader, StateView, Txt } from '@/components/ui';
import { Color, Font, Radius, Space, Stroke, feastTimeLabel } from '@/constants/dumpling';
import { useSeen } from '@/lib/seen';
import { longDate, useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

type FeastRow = FunctionReturnType<typeof api.feasts.list>[number];

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <StateView mascot="wow" title="The Feast did not load" body="Check your connection, then try again." action={<Button label="Try again" onPress={() => void retry()} />} />
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
  // Prefer a video for the cover; a photo works too.
  const shown = episode?.segments.flatMap((s) => (s.type === 'clip' ? [s.dumpling] : s.type === 'montage' ? s.cuts.map((c) => c.dumpling) : [])) ?? [];
  const cover = shown.find((d) => d.mediaType === 'video') ?? shown.find((d) => d.mediaType === 'photo');
  const coverUrl = cover?.url ?? null;
  const coverIsPhoto = cover?.mediaType === 'photo';
  const label = feastLabel(feast);

  if (feast.status === 'cooking') {
    return (
      <View style={styles.hero} testID="feast-cooking">
        <View style={[styles.heroArt, { alignItems: 'center', justifyContent: 'center' }]}>
          <DumplingLoader size={104} dark label="The Chef is cooking your Feast" />
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
        {coverUrl ? (coverIsPhoto ? <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Cover url={coverUrl} />) : <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}><Mascot size={96} steaming={false} /></View>}
        <View style={styles.heroOverlay}>
          <Text style={styles.heroLabel}>{label}{feast.kind === 'special' ? '' : ` · Week ${feast.weekNumber}`}</Text>
          <Text style={styles.heroTitle} numberOfLines={3} testID="latest-feast-title">{feast.title}</Text>
          <Text style={styles.heroMeta}>{when(feast)}</Text>
        </View>
      </Pressable>
      <View style={styles.heroBody}>
        <Button testID="play-feast" icon="play" label="Play the Feast" onPress={() => play(feast.id)} />
      </View>
    </View>
  );
}

function feastLabel(feast: FeastRow) {
  if (feast.kind === 'banquet') return 'Monthly Banquet';
  if (feast.kind === 'reunion') return 'Yearly Reunion';
  if (feast.kind === 'special') return 'Extra Helping';
  return feast.isPilot ? 'Your Pilot' : 'Sunday Feast';
}

/** Sunday Feasts cover a week; an Extra Helping is cooked on a day and covers the seven before it. */
function when(feast: FeastRow) {
  return feast.kind === 'special' ? `Cooked ${longDate(feast.weekOf)}` : `Week of ${longDate(feast.weekOf)}`;
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
        {feast.kind === 'special' ? (
          <Icon name="feast" size={22} color={Color.ink} />
        ) : (
          <>
            <Text style={styles.weekNum}>{feast.weekNumber}</Text>
            <Text style={styles.weekLabel}>Week</Text>
          </>
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="callout" numberOfLines={2} style={{ fontWeight: '600' }}>{feast.title}</Txt>
        <Txt variant="meta">{ready ? (feast.kind === 'special' ? `Extra Helping · ${when(feast)}` : when(feast)) : feast.status === 'cooking' ? 'Cooking…' : 'Did not cook'}</Txt>
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
        {d.mediaType === 'video' && d.url ? (
          <Cover url={d.url} />
        ) : d.mediaType === 'photo' && d.url ? (
          <Image source={{ uri: d.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <Icon name="voice" size={22} color={Color.brandDeep} />
        )}
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
  const cookSpecial = useMutation(api.feasts.cookSpecial);
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

  // Sunday Feasts and Extra Helpings share one timeline; Banquets and Reunions are pinned above it.
  const timeline = feasts.filter((f) => f.kind === 'weekly' || f.kind === 'special');
  const weekly = timeline.filter((f) => f.kind === 'weekly');
  const pinned = feasts.filter((f) => f.kind !== 'weekly' && f.kind !== 'special' && f.status === 'ready');
  const current = timeline.find((f) => f.status === 'cooking') ?? weekly.find((f) => f.weekOf === upcoming?.weekOf && f.status !== 'ready');
  const hero = current ?? timeline.find((f) => f.status === 'ready') ?? null;
  const leftovers = timeline.filter((f) => f.id !== hero?.id);
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
          <View style={styles.countIcon}><Icon name="clock" size={20} color={Color.ink} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="headline" style={{ fontSize: 16, lineHeight: 21 }}>Next Feast: {countdown(date, upcoming.feastHour)}</Txt>
            <Txt variant="meta" testID="sealed-waiting">
              {upcoming.sealedWaiting > 0
                ? `${upcoming.sealedWaiting} sealed ${upcoming.sealedWaiting === 1 ? 'clip is' : 'clips are'} waiting to be opened`
                : `${upcoming.clipsThisWeek} ${upcoming.clipsThisWeek === 1 ? 'moment' : 'moments'} folded this week`}
            </Txt>
          </View>
        </View>
      )}

      {!cooking && (
        <View style={{ gap: Space.xs }}>
          {thisWeekReady ? (
            <LinkButton testID="cook-special" icon="feast" label="Cook an Extra Helping now" onPress={() => auth && void run(() => cookSpecial({ ...auth }))} />
          ) : (
            <LinkButton testID="cook-now" icon="feast" label={feasts.length === 0 ? 'Cook a Pilot now' : 'Cook this week’s Feast early'} onPress={() => auth && void run(() => cook({ ...auth }))} />
          )}
          {thisWeekReady && <Txt variant="meta">A fresh highlight reel from the last seven days, any time you want one. Sunday’s Feast still comes as usual.</Txt>}
        </View>
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

const chunk = { borderWidth: Stroke.line, borderBottomWidth: Stroke.lip, borderColor: Color.ink } as const;

const styles = StyleSheet.create({
  hero: { borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Color.night, ...chunk },
  heroArt: { aspectRatio: 4 / 5, maxHeight: 460, backgroundColor: Color.nightSurface, overflow: 'hidden', borderBottomWidth: Stroke.line, borderColor: Color.ink },
  heroOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: Space.xl, gap: Space.xs, backgroundColor: 'rgba(33,21,15,0.55)' },
  heroLabel: { alignSelf: 'flex-start', color: Color.goldSoft, fontSize: 12, fontWeight: '700', letterSpacing: 1.6, textTransform: 'uppercase', fontFamily: Font.brand },
  heroTitle: { color: Color.nightText, fontSize: 32, lineHeight: 38, fontWeight: '800', fontFamily: Font.display, letterSpacing: -0.3 },
  heroMeta: { color: Color.nightText, opacity: 0.85, fontSize: 13, fontWeight: '700', fontFamily: Font.ui },
  heroBody: { padding: Space.lg, gap: Space.sm, backgroundColor: Color.surface },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.tile, backgroundColor: Color.skySoft, ...chunk },
  countIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: Color.surface, borderWidth: 1.5, borderColor: Color.ink, alignItems: 'center', justifyContent: 'center' },
  pinned: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.lg, borderRadius: Radius.tile, backgroundColor: Color.goldSoft, ...chunk },
  freezer: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.card, backgroundColor: Color.mintSoft, ...chunk },
  freezerThumb: { width: 72, height: 90, borderRadius: Radius.chip, overflow: 'hidden', backgroundColor: Color.surface, borderWidth: 1.5, borderColor: Color.ink, alignItems: 'center', justifyContent: 'center' },
  leftover: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, marginBottom: Space.sm, borderRadius: Radius.tile, backgroundColor: Color.surface, borderWidth: 1.5, borderColor: Color.ink, minHeight: 72 },
  weekBadge: { width: 52, height: 52, borderRadius: 14, backgroundColor: Color.goldSoft, borderWidth: 1.5, borderColor: Color.ink, alignItems: 'center', justifyContent: 'center' },
  weekNum: { fontSize: 20, fontWeight: '800', color: Color.ink, fontFamily: Font.display },
  weekLabel: { fontSize: 10, fontWeight: '700', color: Color.ink, fontFamily: Font.brand },
});
