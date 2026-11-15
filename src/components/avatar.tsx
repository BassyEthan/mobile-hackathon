import { useQuery } from 'convex/react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Txt } from '@/components/ui';
import { Color, Font, Space, avatarTone } from '@/constants/dumpling';
import { useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../convex/_generated/api';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase() || '?';
}

/** Initials on a warm ground. A small orange dot means this person has folded today. */
export function Avatar({ name, size = 36, folded, ring }: { name: string; size?: number; folded?: boolean; ring?: boolean }) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarTone(name) },
          ring && { borderWidth: 2, borderColor: Color.bg },
        ]}>
        <Text maxFontSizeMultiplier={1.2} style={[styles.initials, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
      </View>
      {folded && <View style={[styles.dot, { right: -1, bottom: -1, width: size * 0.32, height: size * 0.32, borderRadius: size * 0.16 }]} />}
    </View>
  );
}

/**
 * The top of every main screen: the Table's name on the left, the people around it on the right.
 * Tapping the family opens the Table; tapping yourself opens your profile.
 */
export function TableHeader({ subtitle }: { subtitle?: string }) {
  const { auth } = useSession();
  const me = useMe();
  const date = useToday(me?.timeZone);
  const seats = useQuery(api.tables.seats, auth && date ? { ...auth, date } : 'skip');
  const others = (seats ?? []).filter((s) => !s.isMe && s.role !== 'guest');
  const shown = others.slice(0, 3);
  return (
    <View style={styles.header}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="title" numberOfLines={1} testID="table-name">{me?.tableName ?? ' '}</Txt>
        {subtitle ? <Txt variant="meta" numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      <Pressable
        testID="open-table"
        accessibilityRole="button"
        accessibilityLabel={`Your Table, ${others.length} ${others.length === 1 ? 'person' : 'people'}`}
        onPress={() => router.push('/table')}
        hitSlop={6}
        style={({ pressed }) => [styles.stack, pressed && { opacity: 0.7 }]}>
        {shown.length === 0 ? (
          <View style={styles.addSeat}>
            <Icon name="plus" size={18} color={Color.brandDeep} />
          </View>
        ) : (
          shown.map((s, i) => (
            <View key={s.id} style={{ marginLeft: i === 0 ? 0 : -10, zIndex: shown.length - i }}>
              <Avatar name={s.displayName} size={32} folded={s.foldedToday} ring />
            </View>
          ))
        )}
        {others.length > shown.length && <Txt variant="caption" style={{ marginLeft: 4 }}>+{others.length - shown.length}</Txt>}
      </Pressable>
      {me && (
        <Pressable
          testID="open-profile"
          accessibilityRole="button"
          accessibilityLabel="Your profile and settings"
          onPress={() => router.push('/profile')}
          hitSlop={6}
          style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Avatar name={me.displayName} size={36} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: Color.text, fontWeight: '600', fontFamily: Font.ui },
  dot: { position: 'absolute', backgroundColor: Color.brand, borderWidth: 2, borderColor: Color.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingHorizontal: Space.gutter, paddingTop: Space.sm, paddingBottom: Space.md },
  stack: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: Space.xs },
  addSeat: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: Color.brand, alignItems: 'center', justifyContent: 'center' },
});
