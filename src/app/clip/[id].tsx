import { useMutation, useQuery } from 'convex/react';
import { useEvent } from 'expo';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router, useLocalSearchParams, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ReactionRow, VoiceReactButton, VoiceReactions } from '@/components/reactions';
import { threadOrder, type Clip } from '@/components/steamer';
import { Button, IconButton, Loading, StateView } from '@/components/ui';
import { Color, Font, Space } from '@/constants/dumpling';
import { useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

type ViewerClip = Clip & { allowShare: boolean };

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={[styles.root, { justifyContent: 'center' }]}>
      <StateView dark mascot="wow" title="This clip did not load" body="Check your connection and try again." action={<Button label="Try again" onPress={() => void retry()} />} />
      <Button kind="onDark" label="Close" onPress={close} />
    </View>
  );
}

function VideoStage({ url, active }: { url: string; active: boolean }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const [userPaused, setUserPaused] = useState(false);
  useEffect(() => {
    if (active && !userPaused) player.play();
    else player.pause();
  }, [active, userPaused, player]);
  return (
    <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'} onPress={() => setUserPaused((p) => !p)}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      {!isPlaying && active && (
        <View style={styles.paused} pointerEvents="none">
          <Icon name="play" size={30} color={Color.nightText} fill={Color.nightText} />
        </View>
      )}
    </Pressable>
  );
}

function AudioStage({ url, active }: { url: string; active: boolean }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    if (active) {
      void player.seekTo(0);
      player.play();
    } else player.pause();
  }, [active, player]);
  return (
    <Pressable
      style={[StyleSheet.absoluteFill, styles.audioStage]}
      accessibilityRole="button"
      accessibilityLabel={status.playing ? 'Pause voice Fold' : 'Play voice Fold'}
      onPress={() => {
        if (status.playing) player.pause();
        else {
          if (status.didJustFinish || status.currentTime >= status.duration - 0.2) void player.seekTo(0);
          player.play();
        }
      }}>
      <View style={styles.voiceDisc}>
        <Icon name={status.playing ? 'voice' : 'play'} size={34} color={Color.nightText} />
      </View>
    </Pressable>
  );
}

function ClipPage({ clip, active, mine, width, height }: { clip: ViewerClip; active: boolean; mine: boolean; width: number; height: number }) {
  const { auth } = useSession();
  const insets = useSafeAreaInsets();
  const remove = useMutation(api.dumplings.remove);
  const setShare = useMutation(api.dumplings.setShare);
  const menu = () => {
    Alert.alert('Your clip', undefined, [
      {
        text: clip.allowShare ? 'Stop sharing from the Feast' : 'Allow sharing from the Feast',
        onPress: () => auth && void setShare({ ...auth, dumplingId: clip.id, allowShare: !clip.allowShare }),
      },
      {
        text: 'Delete clip',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete this clip?', 'It will be removed from the Steamer and from future Feasts.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => auth && void remove({ ...auth, dumplingId: clip.id }) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  return (
    <View style={{ width, height }} testID={`viewer-${clip.id}`}>
      {clip.url ? clip.mediaType === 'video' ? <VideoStage url={clip.url} active={active} /> : <AudioStage url={clip.url} active={active} /> : null}
      <View style={[styles.top, { paddingTop: insets.top + Space.sm }]} pointerEvents="box-none">
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.name} numberOfLines={1}>{mine ? 'You' : clip.memberName}</Text>
          <Text style={styles.meta} numberOfLines={1}>
            {new Date(clip.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            {clip.replyToName ? ` · folding back to ${clip.replyToName}` : clip.spark ? ` · ${clip.spark}` : ''}
          </Text>
        </View>
        {mine && <IconButton icon="more" label="Clip options" tone="dark" filled onPress={menu} testID="clip-menu" />}
        <IconButton icon="close" label="Close" tone="dark" filled onPress={close} />
      </View>
      <View style={[styles.bottom, { paddingBottom: insets.bottom + Space.md }]} pointerEvents="box-none">
        {clip.caption && <Text style={styles.caption}>{clip.caption}</Text>}
        <ReactionRow dumplingId={clip.id} reactions={clip.reactions} dark />
        <VoiceReactions reactions={clip.reactions} dark />
        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <VoiceReactButton dumplingId={clip.id} dark />
          </View>
          {!mine && (
            <View style={{ flex: 1 }}>
              <Button
                testID={`fold-back-${clip.id}`}
                kind="onDark"
                icon="reply"
                label="Fold back"
                onPress={() => router.push({ pathname: '/fold', params: { replyTo: clip.id, prompt: `Fold back to ${clip.memberName}` } })}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

export default function ClipViewer() {
  const { id, date: dateParam } = useLocalSearchParams<{ id: string; date?: string }>();
  const { auth } = useSession();
  const me = useMe();
  const today = useToday(me?.timeZone);
  const date = dateParam ?? today;
  const day = useQuery(api.today.get, auth && date ? { ...auth, date } : 'skip');
  const { width, height } = useWindowDimensions();
  const clips = useMemo(() => threadOrder((day?.dumplings ?? []) as ViewerClip[]), [day?.dumplings]);
  const start = Math.max(0, clips.findIndex((c) => c.id === id));
  const [index, setIndex] = useState(start);
  const list = useRef<FlatList<ViewerClip>>(null);
  const insets = useSafeAreaInsets();

  // Swipe down to close.
  const [drag] = useState(() => new Animated.Value(0));
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx) * 1.6,
        onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
        onPanResponderRelease: (_, g) => {
          if (g.dy > 120 || g.vy > 1.2) close();
          else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [drag],
  );

  if (!day || !me) return <View style={styles.root}><Loading dark /></View>;

  if (!day.lidOff) {
    const folded = day.members.filter((m) => m.folded && !m.isMe).map((m) => m.displayName);
    return (
      <View style={[styles.root, { justifyContent: 'center', padding: Space.xl }]}>
        <StatusBar style="light" />
        <StateView
          dark
          icon="lock"
          title={folded.length ? `${folded.join(', ')} folded today` : 'Today’s moments are under the lid'}
          body="Fold anything of your own and the lid lifts, so you can see everyone’s."
          action={<Button icon="video" label="Fold to lift the lid" onPress={() => router.replace('/fold')} />}
        />
        <Button kind="onDark" label="Close" onPress={close} />
      </View>
    );
  }

  const missing = !clips.some((c) => c.id === id);
  if (clips.length === 0 || (missing && index === start)) {
    return (
      <View style={[styles.root, { justifyContent: 'center', padding: Space.xl }]}>
        <StatusBar style="light" />
        <StateView dark icon="video" title="This clip is no longer here" body="It may have been deleted. Today’s other moments are on the Steamer." action={<Button label="Back to Today" onPress={() => router.dismissTo('/')} />} />
      </View>
    );
  }

  return (
    <Animated.View
      {...responder.panHandlers}
      style={[styles.root, { transform: [{ translateY: drag }], opacity: drag.interpolate({ inputRange: [0, 400], outputRange: [1, 0.6], extrapolate: 'clamp' }) }]}>
      <StatusBar style="light" />
      <FlatList
        ref={list}
        data={clips}
        horizontal
        pagingEnabled
        initialScrollIndex={start}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        showsHorizontalScrollIndicator={false}
        keyExtractor={(c) => c.id}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index: i }) => <ClipPage clip={item} active={i === index} mine={item.memberId === (me.memberId as Id<'members'>)} width={width} height={height} />}
        windowSize={3}
      />
      {clips.length > 1 && (
        <View style={[styles.pager, { top: insets.top + 2 }]} pointerEvents="none">
          {clips.map((c, i) => <View key={c.id} style={[styles.pip, i === index && styles.pipOn]} />)}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.night },
  paused: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  audioStage: { alignItems: 'center', justifyContent: 'center', backgroundColor: Color.nightSurface },
  voiceDisc: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(251,244,236,0.1)', alignItems: 'center', justifyContent: 'center' },
  top: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.lg, paddingBottom: Space.xl, backgroundColor: 'rgba(23,17,14,0.35)' },
  name: { color: Color.nightText, fontSize: 17, fontWeight: '600', fontFamily: Font.ui },
  meta: { color: Color.nightSoft, fontSize: 13, fontWeight: '500', fontFamily: Font.ui },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Space.lg, paddingTop: Space.xl, gap: Space.md, backgroundColor: 'rgba(23,17,14,0.55)' },
  caption: { color: Color.nightText, fontSize: 17, lineHeight: 24, fontFamily: Font.ui, maxWidth: 560 },
  actions: { flexDirection: 'row', gap: Space.sm },
  pager: { position: 'absolute', top: 6, left: Space.lg, right: Space.lg, flexDirection: 'row', gap: 4 },
  pip: { flex: 1, height: 2, borderRadius: 1, backgroundColor: Color.nightLine },
  pipOn: { backgroundColor: Color.nightText },
});

