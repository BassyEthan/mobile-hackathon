import { useMutation } from 'convex/react';
import type { FunctionArgs } from 'convex/server';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Button, Chip, Field, IconButton, LinkButton, Txt } from '@/components/ui';
import { Color, FEAST_TIMES, Font, LANGUAGES, Radius, Space } from '@/constants/dumpling';
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
            <Text maxFontSizeMultiplier={1.3} style={[styles.dayName, on && { color: Color.brandDeep }]}>{isToday ? 'Today' : weekday(d.date)}</Text>
            <Text maxFontSizeMultiplier={1.3} style={[styles.dayNum, on && { color: Color.brandDeep }]}>{dayOfMonth(d.date)}</Text>
            <View style={[styles.dayDot, { opacity: d.clips > 0 ? 1 : 0 }, d.mine && { backgroundColor: Color.brand }]} />
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
    <View style={styles.spark} testID="spark-card">
      <View style={styles.eyebrow}>
        <Icon name="spark" size={16} color={Color.brand} />
        <Txt variant="eyebrow">Today’s spark</Txt>
        {sealed && (
          <View style={styles.sealed} testID="spark-sealed">
            <Icon name="lock" size={12} color={Color.goldDeep} />
            <Txt variant="caption" style={{ color: Color.goldDeep }}>Sealed until Sunday</Txt>
          </View>
        )}
      </View>
      <Pressable accessibilityRole="button" accessibilityHint="Fold an answer to this spark" onPress={onFold}>
        <Txt variant="title" testID="spark-text" style={{ fontWeight: '500' }}>{text}</Txt>
      </Pressable>
      {author && <Txt variant="meta" testID="spark-author">{author}</Txt>}
      <View style={styles.sparkActions}>
        <LinkButton testID="fold-spark" icon="arrow" label="Fold this" onPress={onFold} />
        {canShuffle && <LinkButton testID="next-spark" icon="shuffle" tone="soft" label="Need a spark?" onPress={onShuffle} />}
      </View>
      <View style={styles.askRow}>
        <Txt variant="meta" style={{ flexShrink: 1 }}>Curious about someone?</Txt>
        <LinkButton testID="ask-the-table" icon="ask" label="Ask the Table" onPress={onAsk} />
      </View>
    </View>
  );
}

/* ───────────── Asked of you ───────────── */

export function AskedCard({ ask, onFold }: { ask: { authorName: string; text: string }; onFold: () => void }) {
  return (
    <View style={styles.card} testID="asked-card">
      <View style={styles.eyebrow}>
        <Icon name="ask" size={16} color={Color.brandDeep} />
        <Txt variant="eyebrow">{ask.authorName} asked you</Txt>
      </View>
      <Txt variant="headline" style={{ fontWeight: '500' }}>“{ask.text}”</Txt>
      <LinkButton icon="video" label="Fold an answer" onPress={onFold} />
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
    <View style={styles.card} testID={`reflection-${which}`}>
      <View style={styles.eyebrow}>
        <Txt variant="eyebrow" style={{ flex: 1 }}>A little about you</Txt>
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

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 4 },
  day: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 8, borderRadius: Radius.chip, minHeight: 64 },
  dayOn: { backgroundColor: Color.brandTint },
  dayName: { fontSize: 11, fontWeight: '600', color: Color.textSoft, fontFamily: Font.ui },
  dayNum: { fontSize: 17, fontWeight: '600', color: Color.text, fontFamily: Font.ui },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: Color.borderStrong },
  spark: { gap: Space.sm, paddingTop: Space.xs },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  sealed: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: Color.goldSoft },
  sparkActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: Space.xl },
  askRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: Space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: Color.border, marginTop: Space.xs },
  card: { backgroundColor: Color.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Color.border, padding: Space.lg, gap: Space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
