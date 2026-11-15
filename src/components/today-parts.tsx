import { useMutation } from 'convex/react';
import type { FunctionArgs } from 'convex/server';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { DumplingLogo, LogoMark } from '@/components/logo';
import { Button, Chip, Field, IconButton, Txt } from '@/components/ui';
import { Color, FEAST_TIMES, Font, LANGUAGES, Radius, Space, Stroke } from '@/constants/dumpling';
import { dayOfMonth, weekday, type Me, useSession } from '@/lib/session';
import { api } from '../../convex/_generated/api';

/* ───────────── Day strip ───────────── */

export function DayStrip({ days, selected, today, onSelect }: { days: { date: string; clips: number; mine: boolean }[]; selected: string; today: string; onSelect: (d: string) => void }) {
  return (
    <View style={styles.strip} accessibilityRole="tablist">
      {days.map((d) => {
        const on = d.date === selected;
        const isToday = d.date === today;
        return (
          <Pressable
            key={d.date}
            testID={`day-${d.date}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${isToday ? 'Today' : weekday(d.date, 'long')}, ${d.clips} ${d.clips === 1 ? 'moment' : 'moments'}`}
            onPress={() => onSelect(d.date)}
            style={({ pressed }) => [styles.day, on && styles.dayOn, pressed && { opacity: 0.7 }]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.dayName, on && { color: Color.surface }]}>{isToday ? 'Today' : weekday(d.date)}</Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.dayNum, on && { color: Color.surface }]}>{dayOfMonth(d.date)}</Text>
            <View style={[styles.dayDot, { opacity: d.clips > 0 ? 1 : 0 }, d.mine && { backgroundColor: Color.sun }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/* ───────────── Spark ───────────── */

export function SparkCard({
  text,
  sealed,
  author,
  canShuffle,
  onShuffle,
  onFold,
  onAsk,
}: {
  text: string;
  sealed: boolean;
  author: string | null;
  canShuffle: boolean;
  onShuffle: () => void;
  onFold: () => void;
  onAsk: () => void;
}) {
  return (
    <View style={{ gap: Space.md }}>
      <View style={styles.spark} testID="spark-card">
        <View style={styles.sparkLogo} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <DumplingLogo size={70} />
        </View>
        <View style={styles.eyebrow}>
          <View style={styles.sparkBadge}>
            <Icon name="spark" size={14} color={Color.ink} />
            <Text maxFontSizeMultiplier={1.3} style={styles.sparkBadgeText}>TODAY’S SPARK</Text>
          </View>
          {sealed && (
            <View style={styles.sealed} testID="spark-sealed">
              <Icon name="lock" size={12} color={Color.nightText} />
              <Txt variant="caption" style={{ color: Color.nightText, fontWeight: '700' }}>Sealed till Sunday</Txt>
            </View>
          )}
        </View>
        <Pressable accessibilityRole="button" accessibilityHint="Fold an answer to this spark" onPress={onFold}>
          <Txt variant="display" testID="spark-text" style={{ fontSize: 27, lineHeight: 33, letterSpacing: -0.3 }}>{text}</Txt>
        </Pressable>
        {author && <Txt variant="meta" testID="spark-author" style={{ color: Color.ink, opacity: 0.7 }}>{author}</Txt>}
        <View style={styles.sparkActions}>
          <View style={{ flex: 1 }}>
            <Button testID="fold-spark" icon="video" label="Fold this" onPress={onFold} />
          </View>
          {canShuffle && (
            <Pressable
              testID="next-spark"
              accessibilityRole="button"
              accessibilityLabel="Need a spark? Show another"
              onPress={onShuffle}
              style={({ pressed }) => [styles.shuffle, pressed && styles.pressedChunk]}>
              <Icon name="shuffle" size={22} color={Color.ink} />
            </Pressable>
          )}
        </View>
      </View>
      <Pressable testID="ask-the-table" accessibilityRole="button" accessibilityLabel="Ask the Table" onPress={onAsk} style={({ pressed }) => [styles.askRow, pressed && styles.pressedChunk]}>
        <LogoMark size={44} />
        <View style={{ flex: 1 }}>
          <Txt variant="headline" style={{ fontSize: 16, lineHeight: 21 }}>Ask the Table</Txt>
          <Txt variant="meta" style={{ color: Color.ink, opacity: 0.7 }}>Curious about someone? Send them a question.</Txt>
        </View>
        <Icon name="chevron" size={20} color={Color.ink} />
      </Pressable>
    </View>
  );
}

/* ───────────── Asked of you ───────────── */

export function AskedCard({ ask, onFold }: { ask: { authorName: string; text: string }; onFold: () => void }) {
  return (
    <View style={[styles.card, { backgroundColor: Color.pinkSoft }]} testID="asked-card">
      <View style={styles.eyebrow}>
        <Icon name="ask" size={16} color={Color.ink} />
        <Txt variant="eyebrow" style={{ color: Color.ink }}>{ask.authorName} asked you</Txt>
      </View>
      <Txt variant="title" style={{ fontSize: 22, lineHeight: 29, fontFamily: Font.italic, fontStyle: 'italic', fontWeight: '700' }}>“{ask.text}”</Txt>
      <Button kind="secondary" icon="video" label="Fold an answer" onPress={onFold} />
    </View>
  );
}

/* ───────────── Reflections ───────────── */

const MISS = [
  { key: 'voices', label: 'Their voices' },
  { key: 'food', label: 'The food' },
  { key: 'jokes', label: 'The jokes' },
  { key: 'knowing', label: 'Knowing what they’re up to' },
];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type ReflectionKey = 'missMost' | 'wishLanguage' | 'birthday' | 'sundayTime';

/** One gentle question a day over a member's first four days. Every card can be dismissed. */
export function nextReflection(me: Me): ReflectionKey | null {
  const days = Math.floor((Date.now() - me.joinedAt) / 86_400_000);
  const plan: { key: ReflectionKey; day: number; done: boolean }[] = [
    { key: 'missMost', day: 0, done: !!me.missMost },
    { key: 'wishLanguage', day: 1, done: !!me.wishLanguage },
    { key: 'birthday', day: 2, done: !!me.birthday },
    { key: 'sundayTime', day: 3, done: !!me.sundayTime || me.role === 'host' },
  ];
  return plan.find((p) => !p.done && !me.prompted.includes(p.key) && p.day <= days)?.key ?? null;
}

export function ReflectionCard({ which }: { which: ReflectionKey }) {
  const { auth } = useSession();
  const update = useMutation(api.tables.updateProfile);
  const done = useMutation(api.tables.promptDone);
  const [month, setMonth] = useState<number | null>(null);
  const [day, setDay] = useState('');
  if (!auth) return null;
  const answer = (fields: Omit<FunctionArgs<typeof api.tables.updateProfile>, 'token' | 'memberId'>) => {
    void update({ ...auth, ...fields });
    void done({ ...auth, key: which });
  };
  const question = {
    missMost: 'What do you miss most about your family?',
    wishLanguage: 'Is there a language you wish you spoke better?',
    birthday: 'When is your birthday?',
    sundayTime: 'When does your Sunday slow down?',
  }[which];
  return (
    <View style={[styles.card, { backgroundColor: Color.grapeSoft }]} testID={`reflection-${which}`}>
      <View style={styles.eyebrow}>
        <Txt variant="eyebrow" style={{ flex: 1, color: Color.ink }}>A little about you</Txt>
        <IconButton icon="close" size={18} label="Not now" onPress={() => void done({ ...auth, key: which })} />
      </View>
      <Txt variant="headline">{question}</Txt>
      {which === 'missMost' && (
        <View style={styles.chips}>{MISS.map((m) => <Chip key={m.key} label={m.label} onPress={() => answer({ missMost: m.key })} />)}</View>
      )}
      {which === 'wishLanguage' && (
        <View style={styles.chips}>{LANGUAGES.map((l) => <Chip key={l.code} label={l.label} onPress={() => answer({ wishLanguage: l.code })} />)}</View>
      )}
      {which === 'sundayTime' && (
        <View style={styles.chips}>{FEAST_TIMES.map((t) => <Chip key={t.key} label={t.label} onPress={() => answer({ sundayTime: t.key })} />)}</View>
      )}
      {which === 'birthday' && (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {MONTHS.map((m, i) => <Chip key={m} label={m} selected={month === i + 1} onPress={() => setMonth(i + 1)} />)}
          </ScrollView>
          <View style={{ flexDirection: 'row', gap: Space.md, alignItems: 'flex-end' }}>
            <View style={{ width: 96 }}>
              <Field accessibilityLabel="Day of the month" placeholder="Day" keyboardType="number-pad" maxLength={2} value={day} onChangeText={(t) => setDay(t.replace(/\D/g, ''))} />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                kind="secondary"
                label="Save"
                disabled={!month || !(Number(day) >= 1 && Number(day) <= 31)}
                onPress={() => month && answer({ birthday: { month, day: Number(day) } })}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const chunk = { borderWidth: Stroke.line, borderBottomWidth: Stroke.lip, borderColor: Color.ink } as const;

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: 14, minHeight: 70, backgroundColor: Color.surface, borderWidth: 1.5, borderColor: Color.ink },
  dayOn: { backgroundColor: Color.brand, borderBottomWidth: Stroke.lip },
  dayName: { fontSize: 11, fontWeight: '700', color: Color.textSoft, fontFamily: Font.brand },
  dayNum: { fontSize: 19, fontWeight: '800', color: Color.ink, fontFamily: Font.display },
  dayDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Color.ink },
  spark: { gap: Space.md, padding: Space.xl, borderRadius: Radius.card, backgroundColor: Color.goldSoft, ...chunk },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  sparkBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: Color.surface, borderWidth: 1.5, borderColor: Color.ink, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  sparkBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.4, color: Color.ink, fontFamily: Font.display },
  sealed: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill, backgroundColor: Color.ink },
  sparkLogo: { position: 'absolute', top: -22, right: 14, transform: [{ rotate: '8deg' }] },
  sparkActions: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginTop: Space.xs },
  shuffle: { width: 54, height: 54, borderRadius: 20, backgroundColor: Color.surface, ...chunk, alignItems: 'center', justifyContent: 'center' },
  pressedChunk: { borderBottomWidth: Stroke.line, transform: [{ translateY: Stroke.lip - Stroke.line }] },
  askRow: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.tile, backgroundColor: Color.skySoft, ...chunk },
  card: { backgroundColor: Color.surface, borderRadius: Radius.card, ...chunk, padding: Space.lg, gap: Space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
