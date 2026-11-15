import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ReactionBar, type ReactionSummary } from '@/components/reactions';
import { Card, Txt } from '@/components/ui';
import { Palette, Radius } from '@/constants/dumpling';
import type { Id } from '../../convex/_generated/dataModel';

export type RevealedDumpling = {
  id: Id<'dumplings'>;
  memberName: string;
  mediaType: 'video' | 'audio';
  url: string | null;
  caption: string | null;
  reactions: ReactionSummary;
};

function VideoClip({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isPlaying ? 'Pause clip' : 'Play clip'}
      onPress={() => {
        if (isPlaying) player.pause();
        else {
          if (player.currentTime >= player.duration - 0.2) player.replay();
          else player.play();
        }
      }}>
      <VideoView player={player} style={styles.video} nativeControls={false} contentFit="cover" />
      {!isPlaying && (
        <View style={styles.play}>
          <Text style={styles.playText}>▶︎</Text>
        </View>
      )}
    </Pressable>
  );
}

function AudioClip({ url }: { url: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (status.playing) player.pause();
        else {
          if (status.didJustFinish || status.currentTime >= status.duration - 0.2) void player.seekTo(0);
          player.play();
        }
      }}
      style={[styles.video, styles.audio]}>
      <Text style={[styles.playText, { color: Palette.ink }]}>{status.playing ? '❚❚' : '▶︎'}</Text>
      <Txt variant="small">Voice Fold</Txt>
    </Pressable>
  );
}

export function DumplingCard({ dumpling }: { dumpling: RevealedDumpling }) {
  return (
    <Card style={{ padding: 14 }}>
      <Txt variant="title" style={{ paddingHorizontal: 6 }}>
        {dumpling.memberName}
      </Txt>
      {dumpling.url && (dumpling.mediaType === 'video' ? <VideoClip url={dumpling.url} /> : <AudioClip url={dumpling.url} />)}
      {dumpling.caption && <Txt style={{ paddingHorizontal: 6 }}>{dumpling.caption}</Txt>}
      <ReactionBar dumplingId={dumpling.id} reactions={dumpling.reactions} />
    </Card>
  );
}

const styles = StyleSheet.create({
  video: { width: '100%', aspectRatio: 9 / 12, borderRadius: Radius.card - 8, overflow: 'hidden', backgroundColor: Palette.ink },
  audio: { aspectRatio: 3, backgroundColor: Palette.creamDeep, alignItems: 'center', justifyContent: 'center', gap: 4 },
  play: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playText: { fontSize: 44, color: Palette.cream },
});
