import { useQuery } from 'convex/react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';

import { LogoMark } from '@/components/logo';
import { Txt } from '@/components/ui';
import { Color, Font, Space, avatarTone } from '@/constants/dumpling';
import { useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../convex/_generated/api';

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase() || '?';
}

/** Their profile picture, or initials on a warm ground. A small dot means this person has folded today. */
export function Avatar({ name, uri, size = 36, folded, ring }: { name: string; uri?: string | null; size?: number; folded?: boolean; ring?: boolean }) {
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarTone(name) },
          { borderWidth: ring ? 2 : 1.5, borderColor: Color.ink },
        ]}>
        {uri ? (
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={150} accessibilityLabel={name} />
        ) : (
          <Text maxFontSizeMultiplier={1.2} style={[styles.initials, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
        )}
      </View>
      {folded && <View style={[styles.dot, { right: -1, bottom: -1, width: size * 0.32, height: size * 0.32, borderRadius: size * 0.16 }]} />}
    </View>
  );
}

// The family button and your profile picture sit side by side at exactly the same size.
const HEADER_BUTTON = 40;

const SIDE_BODY = (cx: number) => `M${cx - 10} 35 V27.5 a7.5 7.5 0 0 1 7.5 -7.5 h5 a7.5 7.5 0 0 1 7.5 7.5 V35 Q${cx} 37 ${cx - 10} 35 Z`;
const FRONT_BODY = 'M17 41 V32.5 a8.5 8.5 0 0 1 8.5 -8.5 h5 a8.5 8.5 0 0 1 8.5 8.5 V41 Q28 43.5 17 41 Z';

/** Three people, the middle one in front: the family at the Table. A ring of `ground` separates the front figure. */
export function FamilyMark({ size = 28, ground = Color.goldSoft }: { size?: number; ground?: string }) {
  const outline = { stroke: Color.ink, strokeWidth: 2, strokeLinejoin: 'round' as const, fill: Color.surface };
  return (
    <Svg width={size} height={size * (44 / 56)} viewBox="0 0 56 44">
      <G {...outline}>
        <Circle cx={12} cy={11} r={5.5} />
        <Path d={SIDE_BODY(12)} />
        <Circle cx={44} cy={11} r={5.5} />
        <Path d={SIDE_BODY(44)} />
      </G>
      <G stroke={ground} strokeWidth={6} strokeLinejoin="round" fill={ground}>
        <Circle cx={28} cy={15.5} r={6.5} />
        <Path d={FRONT_BODY} />
      </G>
      <G {...outline}>
        <Circle cx={28} cy={15.5} r={6.5} />
        <Path d={FRONT_BODY} />
      </G>
    </Svg>
  );
}

/**
 * The top of every main screen: the Table's name on the left, the family and you on the right.
 * Tapping the family opens the Table; tapping yourself opens your profile.
 */
export function TableHeader({ subtitle }: { subtitle?: string }) {
  const { auth } = useSession();
  const me = useMe();
  const date = useToday(me?.timeZone);
  const seats = useQuery(api.tables.seats, auth && date ? { ...auth, date } : 'skip');
  const others = (seats ?? []).filter((s) => !s.isMe && s.role !== 'guest');
  return (
    <View style={styles.header}>
      <LogoMark size={44} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="title" numberOfLines={1} testID="table-name" style={{ fontSize: 27, lineHeight: 33 }}>{me?.tableName ?? ' '}</Txt>
        {subtitle ? <Txt variant="meta" numberOfLines={1}>{subtitle}</Txt> : null}
      </View>
      <Pressable
        testID="open-table"
        accessibilityRole="button"
        accessibilityLabel={`Your Table, ${others.length} ${others.length === 1 ? 'person' : 'people'}`}
        onPress={() => router.push('/table')}
        hitSlop={6}
        style={({ pressed }) => [styles.family, pressed && { opacity: 0.7 }]}>
        <FamilyMark size={26} />
      </Pressable>
      {me && (
        <Pressable
          testID="open-profile"
          accessibilityRole="button"
          accessibilityLabel="Your profile and settings"
          onPress={() => router.push('/profile')}
          hitSlop={6}
          style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Avatar name={me.displayName} uri={me.avatarUrl} size={HEADER_BUTTON} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { color: Color.ink, fontWeight: '800', fontFamily: Font.display },
  dot: { position: 'absolute', backgroundColor: Color.mint, borderWidth: 2, borderColor: Color.ink },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingHorizontal: Space.gutter, paddingTop: Space.sm, paddingBottom: Space.md },
  family: { width: HEADER_BUTTON, height: HEADER_BUTTON, borderRadius: HEADER_BUTTON / 2, borderWidth: 1.5, borderColor: Color.ink, backgroundColor: Color.goldSoft, alignItems: 'center', justifyContent: 'center' },
});
