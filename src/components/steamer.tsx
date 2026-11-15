import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { Mascot } from '@/components/mascot';
import { reactionTotal, type ReactionSummary } from '@/components/reactions';
import { Button, ProgressBar, Txt } from '@/components/ui';
import { Color, Font, Radius, Space } from '@/constants/dumpling';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import type { OutboxItem } from '@/lib/outbox';
import type { Id } from '../../convex/_generated/dataModel';

export type Clip = {
  id: Id<'dumplings'>;
  memberId: Id<'members'>;
  memberName: string;
  mediaType: 'video' | 'audio';
  url: string | null;
  caption: string | null;
  createdAt: number;
  spark: string | null;
  replyTo: Id<'dumplings'> | null;
  replyToName: string | null;
  reactions: ReactionSummary;
};

type Member = { id: string; displayName: string; folded: boolean; isMe: boolean };

/** Threads stay together: each clip is followed by the replies folded back to it. */
export function threadOrder<T extends { id: string; replyTo: string | null; createdAt: number }>(clips: T[]) {
  const byId = new Set(clips.map((c) => c.id));
  const children = new Map<string, T[]>();
  for (const c of clips) if (c.replyTo && byId.has(c.replyTo)) children.set(c.replyTo, [...(children.get(c.replyTo) ?? []), c]);
  const out: T[] = [];
  const walk = (c: T) => {
    out.push(c);
    for (const child of (children.get(c.id) ?? []).sort((a, b) => a.createdAt - b.createdAt)) walk(child);
  };
  for (const c of clips.filter((c) => !c.replyTo || !byId.has(c.replyTo)).sort((a, b) => a.createdAt - b.createdAt)) walk(c);
  return out;
}

function Reveal({ index, children }: { index: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: reduced ? 0 : 320,
      delay: reduced ? 0 : Math.min(index, 5) * 60,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [index, progress, reduced]);
  return (
    <Animated.View style={{ opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

function MutedVideo({ url, play }: { url: string; play: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.muted = true;
    p.loop = true;
    if (play) p.play();
  });
  useEffect(() => {
    if (play) player.play();
    else player.pause();
  }, [play, player]);
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

function time(ms: number) {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function ClipTile({ clip, width, onPress, autoplay }: { clip: Clip; width: number; onPress: () => void; autoplay: boolean }) {
  const hearts = reactionTotal(clip.reactions) + clip.reactions.voices.length;
  return (
    <Pressable
      testID={`clip-${clip.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${clip.memberName}${clip.replyToName ? `, folding back to ${clip.replyToName}` : ''}, ${time(clip.createdAt)}${clip.caption ? `. ${clip.caption}` : ''}`}
      accessibilityHint="Opens full screen with sound"
      onPress={onPress}
      style={({ pressed }) => [{ width, gap: Space.sm }, pressed && { opacity: 0.85 }]}>
      <View style={[styles.media, { height: width * 1.3 }]}>
        {clip.mediaType === 'video' && clip.url ? (
          <MutedVideo url={clip.url} play={autoplay} />
        ) : (
          <View style={styles.audio}>
            <Icon name="voice" size={28} color={Color.brandDeep} />
            {clip.caption && <Text numberOfLines={4} style={styles.audioCaption}>{clip.caption}</Text>}
          </View>
        )}
        {clip.replyToName && (
          <View style={styles.badge}>
            <Icon name="reply" size={13} color={Color.nightText} />
            <Text style={styles.badgeText} numberOfLines={1}>{clip.replyToName}</Text>
          </View>
        )}
        {hearts > 0 && (
          <View style={[styles.badge, { left: undefined, right: 8 }]}>
            <Icon name="heart" size={12} color={Color.nightText} fill={Color.nightText} />
            <Text style={styles.badgeText}>{hearts}</Text>
          </View>
        )}
      </View>
      <View style={{ gap: 1, paddingHorizontal: 2 }}>
        <Txt variant="callout" numberOfLines={1} style={{ fontWeight: '600' }}>{clip.memberName}</Txt>
        <Txt variant="caption" numberOfLines={1}>
          {time(clip.createdAt)}
          {clip.caption && clip.mediaType === 'video' ? ` · ${clip.caption}` : ''}
        </Txt>
      </View>
    </Pressable>
  );
}

function SendingTile({ item, width, onRetry, onDiscard }: { item: OutboxItem; width: number; onRetry: () => void; onDiscard: () => void }) {
  const failed = item.state === 'failed';
  return (
    <View style={{ width, gap: Space.sm }} testID="sending-tile">
      <View style={[styles.media, styles.sending, { height: width * 1.3 }]}>
        <Icon name={failed ? 'retry' : item.state === 'sending' ? 'send' : 'offline'} size={22} color={failed ? Color.danger : Color.brandDeep} />
        <Txt variant="meta" style={{ textAlign: 'center', color: Color.text }}>
          {failed ? 'This one did not send' : item.state === 'sending' ? 'Sending…' : 'Waiting for a connection'}
        </Txt>
        {item.state === 'sending' && <View style={{ alignSelf: 'stretch' }}><ProgressBar value={item.progress} /></View>}
        {failed && (
          <View style={{ alignSelf: 'stretch', gap: 4 }}>
            <Button size="sm" kind="secondary" label="Try again" onPress={onRetry} />
            <Button size="sm" kind="quiet" label="Discard" onPress={onDiscard} />
          </View>
        )}
      </View>
      <Txt variant="callout" style={{ fontWeight: '600', paddingHorizontal: 2 }}>You</Txt>
    </View>
  );
}

export function Steamer({
  members,
  lidOff,
  clips,
  pending,
  isToday,
  onOpen,
  onRetry,
  onDiscard,
  onFold,
}: {
  members: Member[];
  lidOff: boolean;
  clips: Clip[];
  pending: OutboxItem[];
  isToday: boolean;
  onOpen: (id: Id<'dumplings'>) => void;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  onFold: () => void;
}) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const tile = Math.floor((Math.min(width, 640) - Space.gutter * 2 - Space.md) / 2);
  const wasOn = useRef<boolean | null>(null);
  useEffect(() => {
    if (wasOn.current === true && lidOff) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    wasOn.current = !lidOff;
  }, [lidOff]);

  const folded = members.filter((m) => m.folded && !m.isMe);
  const names = folded.map((m) => m.displayName);
  const who = names.length === 0 ? null : names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  if (!lidOff) {
    const sending = pending.length > 0;
    return (
      <View style={styles.lid} testID="steamer-lid">
        <View style={styles.lidTop}>
          <Mascot size={44} steaming={folded.length > 0} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="headline" testID="steamer-status">
              {who ? `${who} ${folded.length === 1 ? 'has' : 'have'} folded` : 'The steamer is warming up'}
            </Txt>
            <Txt variant="meta">
              {sending
                ? 'Your Dumpling is on its way. The lid lifts as soon as it lands.'
                : who
                  ? 'Add a moment of your own to lift the lid and see theirs.'
                  : 'Be the first today. Anything you fold lifts the lid.'}
            </Txt>
          </View>
        </View>
        {folded.length > 0 && (
          <View style={styles.seats}>
            {folded.map((m) => (
              <View key={m.id} style={styles.seat}>
                <Avatar name={m.displayName} size={40} folded />
                <Txt variant="caption" numberOfLines={1} style={{ color: Color.text }}>{m.displayName}</Txt>
              </View>
            ))}
          </View>
        )}
        {sending ? (
          pending.map((p) => <SendingTile key={p.id} item={p} width={tile} onRetry={() => onRetry(p.id)} onDiscard={() => onDiscard(p.id)} />)
        ) : (
          <Button testID="lift-lid" kind="secondary" icon="video" label="Fold to lift the lid" onPress={onFold} />
        )}
      </View>
    );
  }

  const ordered = threadOrder(clips);
  if (ordered.length === 0 && pending.length === 0) {
    return (
      <View style={styles.lid}>
        <Txt variant="headline">{isToday ? 'Nothing here yet' : 'A quiet day'}</Txt>
        <Txt variant="meta">{isToday ? 'Your family’s moments will appear here as they fold.' : 'Nobody folded on this day.'}</Txt>
      </View>
    );
  }
  return (
    <View style={styles.grid} testID="steamer-grid">
      {pending.map((p) => (
        <SendingTile key={p.id} item={p} width={tile} onRetry={() => onRetry(p.id)} onDiscard={() => onDiscard(p.id)} />
      ))}
      {ordered.map((c, i) => (
        <Reveal key={c.id} index={i}>
          <ClipTile clip={c} width={tile} autoplay={isToday && !reduced} onPress={() => onOpen(c.id)} />
        </Reveal>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md, rowGap: Space.lg },
  media: { borderRadius: Radius.tile, overflow: 'hidden', backgroundColor: Color.surface2 },
  audio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.sm, padding: Space.md },
  audioCaption: { color: Color.text, fontSize: 14, lineHeight: 19, textAlign: 'center', fontFamily: Font.ui },
  badge: { position: 'absolute', top: 8, left: 8, maxWidth: '70%', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: 12, backgroundColor: 'rgba(23,17,14,0.55)' },
  badgeText: { color: Color.nightText, fontSize: 12, fontWeight: '600', fontFamily: Font.ui },
  sending: { alignItems: 'center', justifyContent: 'center', gap: Space.sm, padding: Space.md, borderWidth: 1, borderColor: Color.border, borderStyle: 'dashed' },
  lid: { backgroundColor: Color.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Color.border, padding: Space.lg, gap: Space.lg },
  lidTop: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  seats: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
  seat: { alignItems: 'center', gap: 4, width: 56 },
});
