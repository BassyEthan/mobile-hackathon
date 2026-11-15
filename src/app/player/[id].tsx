import { useQuery } from 'convex/react';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEvent, useEventListener } from 'expo';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { AwardEmblem } from '@/components/award-emblem';
import { StatusBar } from 'expo-status-bar';
import { Mascot } from '@/components/mascot';
import { ReactionBar } from '@/components/reactions';
import { Palette, Radius, Type } from '@/constants/dumpling';
import { useSession } from '@/lib/session';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { FunctionReturnType } from 'convex/server';

type Feast = NonNullable<FunctionReturnType<typeof api.feasts.get>>;
type Segment = Feast['segments'][number];

const CARD_MS = 4500;

function useTimer(ms: number, onDone: () => void, paused: boolean) {
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(onDone, ms);
    return () => clearTimeout(id);
  }, [ms, onDone, paused]);
}

function HostLine({ text, audioUrl, chefName, onDone, paused }: { text: string; audioUrl: string | null; chefName: string; onDone: () => void; paused: boolean }) {
  const player = useAudioPlayer(audioUrl ?? undefined);
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    if (!audioUrl) return;
    if (paused) player.pause();
    else player.play();
  }, [audioUrl, paused, player]);
  useEffect(() => {
    if (audioUrl && status.didJustFinish) onDone();
  }, [audioUrl, status.didJustFinish, onDone]);
  useTimer(audioUrl ? 20_000 : 2200 + text.length * 55, onDone, paused);
  return (
    <ScrollView contentContainerStyle={styles.centerStage}>
      <Mascot size={100} mood="smile" />
      <Text style={styles.chef}>{chefName}</Text>
      <Text style={styles.line}>{text}</Text>
    </ScrollView>
  );
}

function Clip({ segment, onDone, paused }: { segment: Extract<Segment, { type: 'clip' }>; onDone: () => void; paused: boolean }) {
  const d = segment.dumpling;
  const player = useVideoPlayer(d.mediaType === 'video' ? d.url : null, (p) => {
    p.loop = false;
    p.play();
  });
  const audio = useAudioPlayer(d.mediaType === 'audio' ? (d.url ?? undefined) : undefined);
  const audioStatus = useAudioPlayerStatus(audio);
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  useEventListener(player, 'playToEnd', onDone);
  useEffect(() => {
    if (d.mediaType === 'audio') {
      if (paused) audio.pause();
      else audio.play();
    } else if (paused) player.pause();
    else player.play();
  }, [paused, player, audio, d.mediaType]);
  useEffect(() => {
    if (d.mediaType === 'audio' && audioStatus.didJustFinish) onDone();
  }, [audioStatus.didJustFinish, d.mediaType, onDone]);
  useTimer(status === 'error' || !d.url ? 3000 : 30_000, onDone, paused);
  return (
    <View style={{ flex: 1 }}>
      {d.mediaType === 'video' ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      ) : (
        <View style={styles.centerStage}>
          <Mascot size={100} mood="wow" />
        </View>
      )}
      <View style={styles.clipFooter}>
        <Text style={styles.member}>{d.memberName}</Text>
        {d.caption && <Text style={styles.caption}>{d.caption}</Text>}
        <ReactionBar dumplingId={d.id} reactions={d.reactions} dark />
      </View>
    </View>
  );
}

function Card({ segment, onDone, paused }: { segment: Exclude<Segment, { type: 'clip' } | { type: 'hostLine' }>; onDone: () => void; paused: boolean }) {
  useTimer(segment.type === 'titleCard' && segment.phrase ? CARD_MS + 2000 : CARD_MS, onDone, paused);
  useEffect(() => {
    if (segment.type === 'award') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [segment.type]);
  if (segment.type === 'titleCard') {
    return (
      <ScrollView contentContainerStyle={styles.centerStage}>
        <Text style={styles.kicker}>{segment.title}</Text>
        {segment.phrase ? (
          <>
            <Text style={styles.phrase}>{segment.phrase}</Text>
            {segment.romanization && <Text style={styles.romanization}>{segment.romanization}</Text>}
            {segment.meaning && <Text style={styles.line}>“{segment.meaning}”</Text>}
          </>
        ) : (
          segment.subtitle && <Text style={styles.line}>{segment.subtitle}</Text>
        )}
      </ScrollView>
    );
  }
  if (segment.type === 'award') {
    return (
      <ScrollView contentContainerStyle={styles.centerStage}>
        <AwardEmblem />
        <Text style={styles.kicker}>{segment.award}</Text>
        <Text style={styles.title}>{segment.memberName}</Text>
        <Text style={styles.line}>{segment.text}</Text>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.centerStage}>
      <Text style={styles.kicker}>Secret Ingredient</Text>
      <Text style={styles.title}>{segment.prompt}</Text>
      <Text style={styles.line}>{segment.text}</Text>
    </ScrollView>
  );
}

export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { auth } = useSession();
  const insets = useSafeAreaInsets();
  const feast = useQuery(api.feasts.get, auth && id ? { ...auth, feastId: id as Id<'feasts'> } : 'skip');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const advance = useCallback(() => setIndex((i) => i + 1), []);
  const segments = feast?.segments;
  const total = segments?.length ?? 0;
  const done = index >= total;

  if (feast === null) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.centerStage}>
        <Text style={styles.line}>This Feast is not on your Table.</Text><Pressable accessibilityRole="button" accessibilityLabel="Close Feast" onPress={() => router.canGoBack() ? router.back() : router.replace('/feast')} style={styles.iconButton}><Icon name="close" color={Palette.cream} /></Pressable>
      </ScrollView>
    );
  }
  if (!feast || !segments) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.centerStage}>
        <ActivityIndicator color={Palette.cream} />
      </ScrollView>
    );
  }

  const segment = segments[Math.min(index, total - 1)];
  return (
    <View style={[styles.root, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 10 }]}>
      <StatusBar style="light" />
      <View style={styles.progress}>
        {segments.map((s, i) => (
          <View key={i} style={[styles.dot, i < index && styles.dotDone, i === index && styles.dotNow]} />
        ))}
      </View>
      <View style={styles.topBar}>
        <Text style={styles.feastTitle} numberOfLines={1}>
          {feast.title}
        </Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close Feast" onPress={() => router.canGoBack() ? router.back() : router.replace('/feast')} style={styles.iconButton}>
          <Icon name="close" color={Palette.cream} />
        </Pressable>
      </View>
      <View style={styles.stage} testID={`segment-${index}`}>
        {done ? (
          <ScrollView contentContainerStyle={styles.centerStage}>
            <Mascot size={100} />
            <Text style={styles.title}>That&apos;s the Feast.</Text>
            <Text style={styles.line}>See you next Sunday.</Text>
          </ScrollView>
        ) : segment.type === 'hostLine' ? (
          <HostLine key={index} text={segment.text} audioUrl={segment.audioUrl} chefName={feast.chefName} onDone={advance} paused={paused} />
        ) : segment.type === 'clip' ? (
          <Clip key={index} segment={segment} onDone={advance} paused={paused} />
        ) : (
          <Card key={index} segment={segment} onDone={advance} paused={paused} />
        )}
      </View>
      <View style={styles.controls}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous" onPress={() => setIndex((i) => Math.max(0, i - 1))} style={styles.iconButton}>
          <Icon name="previous" color={Palette.cream} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={done ? 'Play again' : paused ? 'Play' : 'Pause'}
          testID="player-toggle"
          onPress={() => {
            if (done) {
              setIndex(0);
              setPaused(false);
            } else setPaused((p) => !p);
          }}
          style={[styles.iconButton, styles.mainButton]}>
          <Icon name={done ? 'replay' : paused ? 'play' : 'pause'} color={Palette.ink} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next" testID="player-next" disabled={done} onPress={advance} style={[styles.iconButton, done && { opacity: 0.3 }]}>
          <Icon name="next" color={Palette.cream} />
        </Pressable>
      </View>
      <Text style={styles.counter} testID="segment-counter">
        {Math.min(index + 1, total)} / {total}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.night, paddingHorizontal: 16, gap: 10 },
  progress: { flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,246,233,0.2)' },
  dotDone: { backgroundColor: Palette.creamDeep },
  dotNow: { backgroundColor: Palette.accent },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  feastTitle: { flex: 1, color: Palette.creamDeep, fontSize: 13, fontWeight: '500', fontFamily: Type.family },
  stage: { flex: 1, borderRadius: Radius.card, overflow: 'hidden', backgroundColor: '#25201C' },
  centerStage: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  chef: { color: Palette.accent, fontSize: 14, fontWeight: '500', fontFamily: Type.family },
  line: { color: Palette.cream, fontSize: 20, lineHeight: 29, textAlign: 'center', fontFamily: Type.family },
  kicker: { color: Palette.accent, fontSize: 14, fontWeight: '500', fontFamily: Type.family },
  title: { color: Palette.cream, fontSize: 30, lineHeight: 37, fontWeight: '600', textAlign: 'center', fontFamily: Type.family },
  phrase: { color: Palette.cream, fontSize: 32, lineHeight: 42, fontWeight: '600', textAlign: 'center' },
  romanization: { color: Palette.creamDeep, fontSize: 22, fontStyle: 'italic', textAlign: 'center' },
  trophy: { fontSize: 64 },
  clipFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 8, backgroundColor: 'rgba(59,42,32,0.72)' },
  member: { color: Palette.cream, fontSize: 17, fontWeight: '600', fontFamily: Type.family },
  caption: { color: Palette.cream, fontSize: 16, lineHeight: 23, fontFamily: Type.family },
  controls: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 28 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  mainButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: Palette.cream },
  icon: { color: Palette.cream, fontSize: 24 },
  counter: { color: Palette.creamDeep, textAlign: 'center', fontSize: 14 },
});
