import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useEvent, useEventListener } from 'expo';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AwardEmblem } from '@/components/award-emblem';
import { Icon } from '@/components/icon';
import { useVoiceNote, VoiceReactButton } from '@/components/reactions';
import { Button, IconButton, Loading, StateView } from '@/components/ui';
import { Color, Font, Radius, Space } from '@/constants/dumpling';
import { useSeen } from '@/lib/seen';
import { useMe, useSession } from '@/lib/session';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

type Feast = NonNullable<FunctionReturnType<typeof api.feasts.get>>;
type Segment = Feast['segments'][number];
type ClipSegment = Extract<Segment, { type: 'clip' }>;

const CARD_MS = 4800;

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/feast');
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={[styles.root, { justifyContent: 'center' }]}>
      <StateView dark mascot="wow" title="The Feast did not load" body="Check your connection and try again." action={<Button label="Try again" onPress={() => void retry()} />} />
      <Button kind="onDark" label="Close" onPress={close} />
    </View>
  );
}

function useTimer(ms: number, onDone: () => void, paused: boolean) {
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(onDone, ms);
    return () => clearTimeout(id);
  }, [ms, onDone, paused]);
}

function HostLine({ text, audioUrl, chefName, onDone, paused, captions }: { text: string; audioUrl: string | null; chefName: string; onDone: () => void; paused: boolean; captions: boolean }) {
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
  useTimer(audioUrl ? 20_000 : 2400 + text.length * 55, onDone, paused);
  return (
    <ScrollView contentContainerStyle={styles.centerStage}>
      <View style={styles.rule} />
      <Text style={styles.kicker}>{chefName}</Text>
      {captions || !audioUrl ? <Text style={styles.line}>{text}</Text> : <Icon name="voice" size={28} color={Color.nightSoft} />}
    </ScrollView>
  );
}

function ClipStage({ segment, onDone, paused, captions }: { segment: ClipSegment; onDone: () => void; paused: boolean; captions: boolean }) {
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
          <View style={styles.voiceDisc}><Icon name="voice" size={32} color={Color.nightText} /></View>
        </View>
      )}
      <View style={styles.lowerThird} pointerEvents="none">
        <Text style={styles.member}>{d.memberName}</Text>
        {captions && d.caption && <Text style={styles.caption}>{d.caption}</Text>}
      </View>
    </View>
  );
}

function PhraseCard({ segment, feastId }: { segment: Extract<Segment, { type: 'titleCard' }>; feastId: Id<'feasts'> }) {
  const { auth } = useSession();
  const attempt = useMutation(api.members.attemptPhrase);
  const voice = useVoiceNote(async (storageId) => auth && segment.phrase && attempt({ ...auth, feastId, phrase: segment.phrase, ...(segment.meaning ? { meaning: segment.meaning } : {}), storageId }), 6000);
  const recording = voice.state === 'recording';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Say the phrase back"
      accessibilityHint="Hold to record, release to save it to your profile"
      onPressIn={voice.onPressIn}
      onPressOut={voice.onPressOut}
      style={[styles.sayIt, recording && { backgroundColor: Color.brand }]}>
      <Icon name={voice.state === 'sent' ? 'check' : 'mic'} size={18} color={Color.nightText} />
      <Text style={styles.sayText}>
        {voice.state === 'sent' ? 'Saved to your profile' : recording ? 'Release to save' : voice.state === 'denied' ? 'Allow the microphone to practise' : 'Hold to say it back'}
      </Text>
    </Pressable>
  );
}

function CardStage({ segment, onDone, paused, feastId, chefName }: { segment: Exclude<Segment, { type: 'clip' } | { type: 'hostLine' }>; onDone: () => void; paused: boolean; feastId: Id<'feasts'>; chefName: string }) {
  const [holding, setHolding] = useState(false);
  useTimer(segment.type === 'titleCard' && segment.phrase ? CARD_MS + 4000 : CARD_MS, onDone, paused || holding);
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
            <View onTouchStart={() => setHolding(true)} onTouchEnd={() => setHolding(false)}>
              <PhraseCard segment={segment} feastId={feastId} />
            </View>
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
        <Text style={[styles.kicker, { color: Color.gold }]}>{segment.award}</Text>
        <Text style={styles.title}>{segment.memberName}</Text>
        <Text style={[styles.line, { color: Color.nightSoft }]}>{segment.text}</Text>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.centerStage}>
      <Text style={styles.kicker}>{chefName}</Text>
      <Text style={styles.line}>{segment.text}</Text>
    </ScrollView>
  );
}

export default function Player() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { auth } = useSession();
  const me = useMe();
  const insets = useSafeAreaInsets();
  const { markFeast } = useSeen();
  const feast = useQuery(api.feasts.get, auth && id ? { ...auth, feastId: id as Id<'feasts'> } : 'skip');
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [captions, setCaptions] = useState(true);
  const held = useRef(false);
  const advance = useCallback(() => setIndex((i) => i + 1), []);

  useEffect(() => {
    if (id) markFeast(id);
  }, [id, markFeast]);

  if (feast === null) {
    return (
      <View style={[styles.root, { justifyContent: 'center', padding: Space.xl }]}>
        <StateView dark icon="feast" title="This Feast is not on your Table" body="It may belong to another Table, or it was removed." action={<Button label="Go to the Feast" onPress={() => router.replace('/feast')} />} />
      </View>
    );
  }
  if (!feast || !me) return <View style={styles.root}><Loading dark label="Setting the table…" /></View>;

  // The Secret Ingredient closes the show on its own end screen.
  const secret = feast.segments.find((s): s is Extract<Segment, { type: 'secretIngredient' }> => s.type === 'secretIngredient');
  const segments = feast.segments.filter((s) => s.type !== 'secretIngredient');
  const total = segments.length;
  const done = index >= total;
  const segment = segments[Math.min(index, total - 1)];
  const clip = !done && segment?.type === 'clip' ? segment.dumpling : null;
  const canShare = !!clip?.url && (clip.memberId === me.memberId || clip.allowShare);

  const back = () => setIndex((i) => Math.max(0, i - 1));
  const shareSegment = async () => {
    if (!clip?.url) return;
    try {
      await Share.share({ message: `${clip.memberName}, from our family Feast “${feast.title}”${clip.caption ? `: “${clip.caption}”` : ''}`, url: clip.url });
    } catch {}
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + Space.xs, paddingBottom: insets.bottom + Space.sm }]}>
      <StatusBar style="light" />
      <View style={styles.bars} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: total, now: Math.min(index + 1, total) }}>
        {segments.map((_, i) => <View key={i} style={[styles.bar, i < index && styles.barDone, i === index && styles.barNow]} />)}
      </View>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.feastTitle} numberOfLines={1}>{feast.title}</Text>
          <Text style={styles.feastMeta} testID="segment-counter">Week {feast.weekNumber} · {Math.min(index + 1, total)} of {total}</Text>
        </View>
        <IconButton icon={captions ? 'captions' : 'captionsOff'} label={captions ? 'Hide captions' : 'Show captions'} tone="dark" onPress={() => setCaptions((c) => !c)} testID="captions-toggle" />
        <IconButton icon="close" label="Close Feast" tone="dark" onPress={close} />
      </View>

      <View style={styles.stage} testID={`segment-${index}`}>
        {done ? (
          <ScrollView contentContainerStyle={styles.centerStage} testID="feast-end">
            <View style={styles.rule} />
            <Text style={styles.kicker}>Secret Ingredient</Text>
            <Text style={styles.title}>{secret?.prompt ?? 'See you next Sunday.'}</Text>
            {secret && <Text style={[styles.line, { color: Color.nightSoft }]}>{secret.text}</Text>}
            <View style={{ alignSelf: 'stretch', gap: Space.sm, marginTop: Space.lg }}>
              <Button testID="fold-now" icon="video" label="Fold now" onPress={() => router.replace('/fold')} />
              <Button testID="watch-again" kind="onDark" icon="replay" label="Watch again" onPress={() => { setIndex(0); setPaused(false); }} />
            </View>
          </ScrollView>
        ) : (
          <>
            {segment.type === 'hostLine' ? (
              <HostLine key={index} text={segment.text} audioUrl={segment.audioUrl} chefName={feast.chefName} onDone={advance} paused={paused} captions={captions} />
            ) : segment.type === 'clip' ? (
              <ClipStage key={index} segment={segment} onDone={advance} paused={paused} captions={captions} />
            ) : (
              <CardStage key={index} segment={segment} onDone={advance} paused={paused} feastId={id as Id<'feasts'>} chefName={feast.chefName} />
            )}
            {/* Tap left to go back, tap right to skip, hold anywhere to pause. */}
            <View style={styles.zones} pointerEvents={segment.type === 'titleCard' && segment.phrase ? 'none' : 'auto'}>
              {(['back', 'next'] as const).map((zone) => (
                <Pressable
                  key={zone}
                  testID={zone === 'next' ? 'player-next' : 'player-back'}
                  accessibilityRole="button"
                  accessibilityLabel={zone === 'next' ? 'Next segment' : 'Previous segment'}
                  delayLongPress={220}
                  onLongPress={() => {
                    held.current = true;
                    setPaused(true);
                  }}
                  onPressOut={() => {
                    if (held.current) {
                      held.current = false;
                      setPaused(false);
                    }
                  }}
                  onPress={() => (zone === 'next' ? advance() : back())}
                  style={{ flex: zone === 'next' ? 2 : 1 }}
                />
              ))}
            </View>
            {paused && (
              <View style={styles.pausedBadge} pointerEvents="none">
                <Icon name="pause" size={22} color={Color.nightText} />
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.controls}>
        {clip ? (
          <>
            <View style={{ flex: 1 }}><VoiceReactButton dumplingId={clip.id} dark /></View>
            {canShare && <IconButton icon="share" label="Share this moment" tone="dark" filled onPress={() => void shareSegment()} testID="share-segment" />}
          </>
        ) : (
          <Pressable
            testID="player-toggle"
            accessibilityRole="button"
            accessibilityLabel={done ? 'Play again' : paused ? 'Play' : 'Pause'}
            onPress={() => (done ? (setIndex(0), setPaused(false)) : setPaused((p) => !p))}
            style={styles.toggle}>
            <Icon name={done ? 'replay' : paused ? 'play' : 'pause'} size={20} color={Color.nightText} />
            <Text style={styles.toggleText}>{done ? 'Watch again' : paused ? 'Play' : 'Pause'}</Text>
          </Pressable>
        )}
        {!done && !clip && <IconButton icon="chevron" label="Next segment" tone="dark" filled onPress={advance} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.night, paddingHorizontal: Space.md, gap: Space.sm },
  bars: { flexDirection: 'row', gap: 3, paddingHorizontal: Space.xs },
  bar: { flex: 1, height: 2.5, borderRadius: 2, backgroundColor: Color.nightLine },
  barDone: { backgroundColor: Color.nightSoft },
  barNow: { backgroundColor: Color.nightText },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingLeft: Space.xs },
  feastTitle: { color: Color.nightText, fontSize: 15, fontWeight: '600', fontFamily: Font.ui },
  feastMeta: { color: Color.nightSoft, fontSize: 12, fontWeight: '500', fontFamily: Font.ui },
  stage: { flex: 1, borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Color.nightSurface },
  zones: { ...StyleSheet.absoluteFill, flexDirection: 'row' },
  centerStage: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: Space.xl, gap: Space.md },
  rule: { width: 28, height: 1, backgroundColor: Color.gold, marginBottom: Space.sm },
  kicker: { color: Color.brand, fontSize: 14, fontWeight: '600', fontFamily: Font.ui },
  line: { color: Color.nightText, fontSize: 21, lineHeight: 30, textAlign: 'center', fontFamily: Font.ui, maxWidth: 560 },
  title: { color: Color.nightText, fontSize: 30, lineHeight: 37, fontWeight: '700', textAlign: 'center', fontFamily: Font.brand, maxWidth: 560 },
  phrase: { color: Color.nightText, fontSize: 34, lineHeight: 44, fontWeight: '600', textAlign: 'center' },
  romanization: { color: Color.nightSoft, fontSize: 20, fontStyle: 'italic', textAlign: 'center' },
  voiceDisc: { width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(251,244,236,0.1)', alignItems: 'center', justifyContent: 'center' },
  lowerThird: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Space.lg, paddingTop: Space.xl, paddingBottom: Space.lg, gap: 6, backgroundColor: 'rgba(23,17,14,0.55)' },
  member: { color: Color.nightText, fontSize: 15, fontWeight: '600', fontFamily: Font.ui },
  caption: { color: Color.nightText, fontSize: 19, lineHeight: 26, fontFamily: Font.ui },
  sayIt: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, minHeight: 48, paddingHorizontal: Space.lg, borderRadius: Radius.button, backgroundColor: 'rgba(251,244,236,0.12)', marginTop: Space.md },
  sayText: { color: Color.nightText, fontSize: 15, fontWeight: '600', fontFamily: Font.ui },
  pausedBadge: { position: 'absolute', top: Space.md, right: Space.md, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(23,17,14,0.6)', alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, minHeight: 52 },
  toggle: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.sm, minHeight: 48, borderRadius: Radius.button, backgroundColor: 'rgba(251,244,236,0.08)' },
  toggleText: { color: Color.nightText, fontSize: 15, fontWeight: '600', fontFamily: Font.ui },
});
