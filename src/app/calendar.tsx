import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { IconButton, Loading, NavBar, Screen, Txt } from '@/components/ui';
import { Color, Font, Radius, Space, Stroke } from '@/constants/dumpling';
import { addDays, useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../convex/_generated/api';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function shiftMonth(first: string, by: number) {
  const d = new Date(`${first}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + by, 1);
  return d.toISOString().slice(0, 10);
}

function monthLabel(first: string) {
  return new Date(`${first}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Every day your Table has existed, a month at a time. A filled day is one you folded, so it is open to you; a lock
 * marks a day when family folded but you did not, so those moments stay closed. Tap any day to open it.
 */
export default function Calendar() {
  const { auth } = useSession();
  const me = useMe();
  const today = useToday(me?.timeZone);
  const [month, setMonth] = useState<string | null>(null);
  const first = month ?? (today ? monthStart(today) : null);
  // The grid starts on the Sunday on or before the 1st and always shows six weeks.
  const gridStart = first ? addDays(first, -new Date(`${first}T12:00:00Z`).getUTCDay()) : null;
  const gridEnd = gridStart ? addDays(gridStart, 41) : null;
  const data = useQuery(api.today.range, auth && gridStart && gridEnd ? { ...auth, from: gridStart, to: gridEnd } : 'skip');

  if (!today || !first || !data) {
    return (
      <Screen scroll={false} header={<NavBar onBack={back} title="Calendar" />}>
        <Loading />
      </Screen>
    );
  }

  const canGoBack = shiftMonth(first, -1) >= monthStart(data.start);
  const canGoForward = first < monthStart(today);
  const weeks = Array.from({ length: 6 }, (_, w) => data.days.slice(w * 7, w * 7 + 7));
  const thisMonth = first.slice(0, 7);
  const folded = data.days.filter((d) => d.date.slice(0, 7) === thisMonth && d.mine).length;

  return (
    <Screen header={<NavBar onBack={back} title="Calendar" />} gap={Space.lg}>
      <View style={styles.monthRow}>
        <IconButton icon="back" label="Previous month" filled disabled={!canGoBack} onPress={() => setMonth(shiftMonth(first, -1))} />
        <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
          <Txt variant="title" accessibilityRole="header">{monthLabel(first)}</Txt>
          <Txt variant="meta">{folded === 0 ? 'No folds yet this month' : `You folded ${folded} ${folded === 1 ? 'day' : 'days'}`}</Txt>
        </View>
        <IconButton icon="chevron" label="Next month" filled disabled={!canGoForward} onPress={() => setMonth(shiftMonth(first, 1))} />
      </View>

      <View style={styles.grid}>
        <View style={styles.week}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={styles.weekday} maxFontSizeMultiplier={1.3}>{d}</Text>
          ))}
        </View>
        {weeks.map((week, w) => (
          <View key={w} style={styles.week}>
            {week.map((day) => {
              const inMonth = day.date.slice(0, 7) === thisMonth;
              const usable = day.date >= data.start && day.date <= today;
              const isToday = day.date === today;
              const locked = usable && day.clips > 0 && !day.mine && !isToday;
              return (
                <Pressable
                  key={day.date}
                  testID={`cal-${day.date}`}
                  disabled={!usable}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !usable }}
                  accessibilityLabel={`${day.date}${isToday ? ', today' : ''}${day.mine ? ', you folded' : ''}${day.clips ? `, ${day.clips} ${day.clips === 1 ? 'moment' : 'moments'}` : ''}${locked ? ', locked' : ''}`}
                  onPress={() => router.navigate({ pathname: '/', params: { date: day.date } })}
                  style={({ pressed }) => [
                    styles.day,
                    day.mine && styles.dayMine,
                    isToday && !day.mine && styles.dayToday,
                    !inMonth && { opacity: 0.35 },
                    !usable && { opacity: inMonth ? 0.3 : 0.15 },
                    pressed && { transform: [{ scale: 0.94 }] },
                  ]}>
                  <Text maxFontSizeMultiplier={1.3} style={[styles.num, day.mine && { color: Color.surface }]}>{Number(day.date.slice(8, 10))}</Text>
                  {locked ? (
                    <Icon name="lock" size={11} color={Color.textSoft} />
                  ) : day.clips > 0 && !day.mine ? (
                    <View style={styles.dot} />
                  ) : (
                    <View style={{ height: 11 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendRow}>
          <View style={[styles.swatch, styles.dayMine]} />
          <Txt variant="meta" style={{ flex: 1 }}>You folded. That day’s moments are open to you.</Txt>
        </View>
        <View style={styles.legendRow}>
          <View style={[styles.swatch, { alignItems: 'center', justifyContent: 'center' }]}><Icon name="lock" size={12} color={Color.textSoft} /></View>
          <Txt variant="meta" style={{ flex: 1 }}>Family folded but you didn’t, so those stay closed. They’ll still play in the Sunday Feast.</Txt>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  grid: { gap: 6, padding: Space.md, borderRadius: Radius.card, backgroundColor: Color.surface, borderWidth: Stroke.line, borderBottomWidth: Stroke.lip, borderColor: Color.ink },
  week: { flexDirection: 'row', gap: 6 },
  weekday: { flex: 1, textAlign: 'center', fontFamily: Font.brand, fontWeight: '700', fontSize: 12, color: Color.textSoft, paddingVertical: 4 },
  day: { flex: 1, aspectRatio: 0.82, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: Color.bg },
  dayMine: { backgroundColor: Color.brand, borderWidth: 1.5, borderColor: Color.ink },
  dayToday: { borderWidth: 2, borderColor: Color.ink, backgroundColor: Color.goldSoft },
  num: { fontFamily: Font.display, fontWeight: '800', fontSize: 16, color: Color.ink },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Color.ink, marginVertical: 2.5 },
  legend: { gap: Space.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  swatch: { width: 26, height: 26, borderRadius: 8, backgroundColor: Color.bg, borderWidth: 1.5, borderColor: Color.border },
});
