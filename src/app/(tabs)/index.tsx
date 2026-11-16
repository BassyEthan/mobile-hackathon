import { useMutation, useQuery } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AskSheet } from '@/components/ask-the-table';
import { TableHeader } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { DumplingLoader } from '@/components/loader';
import { Sheet } from '@/components/sheet';
import { Steamer } from '@/components/steamer';
import { AskedCard, DayStrip, ReflectionCard, SparkCard, nextReflection } from '@/components/today-parts';
import { Banner, Button, Card, LinkButton, Loading, Screen, StateView, Txt } from '@/components/ui';
import { Color, Font, Radius, Space } from '@/constants/dumpling';
import { shareInvite } from '@/lib/invite';
import { enableNotifications } from '@/lib/notifications';
import { useOutbox } from '@/lib/outbox';
import { useSeen } from '@/lib/seen';
import { addDays, longDate, useMe, useSession, useToday, weekday } from '@/lib/session';
import { loadValue, saveValue } from '@/lib/storage';
import { api } from '../../../convex/_generated/api';

function greeting(name: string) {
  const hour = new Date().getHours();
  const part = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${name}`;
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <StateView mascot="wow" title="Today did not load" body="Check your connection, then try again." action={<Button label="Try again" onPress={() => void retry()} />} />
      </View>
    </Screen>
  );
}

export default function Today() {
  const { auth } = useSession();
  const me = useMe();
  const insets = useSafeAreaInsets();
  const today = useToday(me?.timeZone);
  const [selected, setSelected] = useState<string | null>(null);
  // The calendar opens a day by navigating here with ?date=YYYY-MM-DD.
  const params = useLocalSearchParams<{ date?: string }>();
  const [openedFromCalendar, setOpenedFromCalendar] = useState<string | undefined>();
  if (params.date && today && params.date !== openedFromCalendar) {
    setOpenedFromCalendar(params.date);
    setSelected(params.date === today ? null : params.date);
  }
  if (!params.date && openedFromCalendar) setOpenedFromCalendar(undefined);
  // Clear the param once applied, so picking the same day from the calendar again still works.
  useEffect(() => {
    if (params.date && params.date === openedFromCalendar) router.setParams({ date: undefined });
  }, [params.date, openedFromCalendar]);
  const date = selected ?? today;
  const isToday = date === today;
  const day = useQuery(api.today.get, auth && date ? { ...auth, date } : 'skip');
  const week = useQuery(api.today.week, auth && today ? { ...auth, date: today } : 'skip');
  const feasts = useQuery(api.feasts.list, auth ?? 'skip');
  const asked = useQuery(api.today.asksForMe, auth ?? 'skip');
  const ensureFilling = useMutation(api.today.ensureFilling);
  const savePushToken = useMutation(api.tables.savePushToken);
  const outbox = useOutbox();
  const seen = useSeen();
  const [sparkIndex, setSparkIndex] = useState(0);
  const [askOpen, setAskOpen] = useState(false);
  const [notifyAsk, setNotifyAsk] = useState(false);
  const laidFor = useRef<string | null>(null);
  const spokenFor = useRef<string | null>(null);

  useEffect(() => {
    if (auth && today && day && isToday && day.filling === null && laidFor.current !== today) {
      laidFor.current = today;
      void ensureFilling({ ...auth });
    }
  }, [auth, today, day, isToday, ensureFilling]);

  // Mark today's moments as seen while this screen is in front.
  const todayClips = week?.find((d) => d.date === today)?.clips ?? 0;
  const { markToday } = seen;
  useFocusEffect(useCallback(() => {
    if (today) markToday(today, todayClips);
  }, [today, todayClips, markToday]));

  const sparks = day?.filling?.sparks ?? [];
  const spark = sparks.length ? sparks[sparkIndex % sparks.length] : null;

  // Elder mode reads the spark aloud once when Today opens.
  useEffect(() => {
    if (!me?.isElder || !spark || !isToday || spokenFor.current === spark.text) return;
    spokenFor.current = spark.text;
    Speech.speak(spark.text, { language: me.language, rate: 0.92 });
    return () => void Speech.stop();
  }, [me?.isElder, me?.language, spark, isToday]);

  // A new member is asked about notifications only after they have felt the first lid lift.
  useEffect(() => {
    if (!day?.lidOff || !isToday || !me || me.hasPushToken) return;
    void loadValue<boolean>('askNotify').then((pending) => pending && setNotifyAsk(true));
  }, [day?.lidOff, isToday, me]);

  if (!me || !today || !date || !day) {
    return (
      <Screen scroll={false} header={<TableHeader />}>
        <Loading label="Warming the steamer…" />
      </Screen>
    );
  }

  const pending = isToday ? outbox.items : [];
  const latest = feasts?.[0];
  const latestReady = feasts?.find((f) => f.status === 'ready');
  const alone = day.members.length <= 1;
  const reflection = isToday ? nextReflection(me) : null;
  // A question leaves the moment its answer is folded, even while the clip is still sending.
  const ask = isToday ? asked?.find((a) => !outbox.items.some((i) => i.params.askId === a.id)) : undefined;

  const fold = (extra?: { fillingId: string; sparkKey: string; prompt: string }) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(extra ? { pathname: '/fold', params: extra } : '/fold');
  };
  const foldSpark = () => spark && day.filling && fold({ fillingId: day.filling.id, sparkKey: spark.key, prompt: spark.text });

  const banner = !isToday ? null : latest?.status === 'cooking' ? (
    <Banner icon="feast" leading={<DumplingLoader compact size={34} label="Cooking your Feast" />} tone="plain" title="The Chef is cooking your Feast" detail="It will be ready in about a minute." onPress={() => router.navigate('/feast')} />
  ) : latestReady && seen.loaded && seen.feastId !== latestReady.id ? (
    <Banner
      testID="feast-banner"
      icon="play"
      tone="gold"
      title={latestReady.isPilot ? 'Your Pilot is ready' : 'The Feast is served'}
      detail={latestReady.title}
      action="Watch"
      onPress={() => router.push({ pathname: '/player/[id]', params: { id: latestReady.id } })}
    />
  ) : null;

  return (
    <View style={{ flex: 1, backgroundColor: Color.bg }}>
      <Screen header={<TableHeader subtitle={greeting(me.nickname ?? me.displayName)} />} gap={Space.xl} bottomInset={me.isElder ? 96 : 0}>
        {!outbox.online && <Banner icon="offline" title="You’re offline" detail="Anything you fold will send when you’re back." testID="offline-banner" />}

        <View style={{ gap: Space.sm }}>
          {week && <DayStrip days={week} selected={date} today={today} onSelect={(d) => setSelected(d === today ? null : d)} />}
          <View style={styles.calendarRow}>
            {!isToday && <LinkButton testID="back-to-today" icon="back" tone="soft" label="Back to today" onPress={() => setSelected(null)} />}
            <View style={{ flex: 1 }} />
            <LinkButton testID="open-calendar" icon="calendar" label="Full calendar" onPress={() => router.push('/calendar')} />
          </View>
        </View>

        {banner}

        {ask && (
          <AskedCard
            ask={ask}
            onFold={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push({ pathname: '/fold', params: { askId: ask.id, prompt: ask.text } });
            }}
          />
        )}

        {isToday ? (
          <SparkCard
            text={spark?.text ?? 'Fold anything you like today.'}
            sealed={spark?.type === 'sealed'}
            author={spark?.key === 'primary' && day.filling?.authorName ? `Asked by ${day.filling.authorName}${day.filling.addressedToName ? ` for ${day.filling.addressedToName}` : ''}` : null}
            canShuffle={sparks.length > 1}
            onShuffle={() => {
              void Haptics.selectionAsync();
              setSparkIndex((i) => i + 1);
            }}
            onFold={() => (spark ? foldSpark() : fold())}
            onAsk={() => setAskOpen(true)}
          />
        ) : (
          <View style={{ gap: 4 }}>
            <Txt variant="title">{weekday(date, 'long')}</Txt>
            <Txt variant="meta">{longDate(date)}{day.filling ? ` · ${day.filling.prompt}` : ''}</Txt>
          </View>
        )}

        <View style={{ gap: Space.lg }}>
          {isToday && (
            <View style={styles.sectionRow}>
              <Txt variant="title">The Steamer</Txt>
              <Pressable onLongPress={() => router.push('/convex-check')} accessibilityElementsHidden>
                <Txt variant="meta" testID="table-week">Week {day.week}</Txt>
              </Pressable>
            </View>
          )}
          {alone && isToday ? (
            <Card testID="invite-card">
              <Txt variant="headline">Your Table has one seat filled</Txt>
              <Txt variant="meta">Dumpling comes alive when your family joins. Send them the link; it opens straight into your Table.</Txt>
              <Button icon="family" label="Invite your family" onPress={() => void shareInvite(me.tableName, me.joinCode, me.memberId)} />
            </Card>
          ) : null}
          <Steamer
            members={day.members}
            lidOff={day.lidOff}
            clips={day.dumplings}
            pending={pending}
            isToday={isToday}
            onFold={() => fold()}
            onOpen={(id) => router.push({ pathname: '/clip/[id]', params: { id, date } })}
            onRetry={outbox.retry}
            onDiscard={outbox.discard}
          />
          {date === addDays(today, -6) && <LinkButton icon="calendar" label="See earlier days in the calendar" onPress={() => router.push('/calendar')} />}
        </View>

        {/* Getting-to-know-you questions are optional, so they sit after the family's moments. */}
        {reflection && <ReflectionCard key={reflection} which={reflection} />}
      </Screen>

      {me.isElder && (
        <View style={[styles.elderBar, { paddingBottom: Math.max(insets.bottom, Space.lg) }]}>
          {latestReady && (
            <Button kind="secondary" icon="play" label="Watch the Feast" onPress={() => router.push({ pathname: '/player/[id]', params: { id: latestReady.id } })} />
          )}
          <Pressable testID="elder-record" accessibilityRole="button" accessibilityLabel="Record a Dumpling" onPress={() => (spark ? foldSpark() : fold())} style={({ pressed }) => [styles.elderRecord, pressed && { opacity: 0.85 }]}>
            <Icon name="video" size={28} color={Color.surface} />
            <Text style={styles.elderText}>Record a moment</Text>
          </Pressable>
        </View>
      )}

      <AskSheet visible={askOpen} onClose={() => setAskOpen(false)} date={today} members={day.members} />

      <Sheet visible={notifyAsk} title="The lid is off" onClose={() => { setNotifyAsk(false); void saveValue('askNotify', null); }}>
        <Txt>Want to know when your family folds? Dumpling sends at most two notifications a day, and only about people you love.</Txt>
        <Button
          testID="notify-yes"
          icon="bell"
          label="Yes, let me know"
          onPress={async () => {
            const token = await enableNotifications();
            if (token && auth) await savePushToken({ ...auth, pushToken: token });
            setNotifyAsk(false);
            void saveValue('askNotify', null);
          }}
        />
        <Button kind="quiet" label="Not now" onPress={() => { setNotifyAsk(false); void saveValue('askNotify', null); }} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  calendarRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  elderBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Space.gutter, paddingTop: Space.md, gap: Space.sm, backgroundColor: Color.bg, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Color.border },
  elderRecord: { minHeight: 76, borderRadius: Radius.card, backgroundColor: Color.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.md },
  elderText: { color: Color.surface, fontSize: 22, fontWeight: '600', fontFamily: Font.ui },
});
