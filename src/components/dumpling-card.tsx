import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEvent } from 'expo';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ReactionBar, type ReactionSummary } from '@/components/reactions';
import { Button, Card, Txt } from '@/components/ui';
import { Palette, Radius } from '@/constants/dumpling';
import type { Id } from '../../convex/_generated/dataModel';

export type RevealedDumpling = {
  id: Id<'dumplings'>;
  memberName: string;
  mediaType: 'video' | 'audio';
  url: string | null;
  caption: string | null;
  spark?: string | null;
  replyTo?: Id<'dumplings'> | null;
  replyToName?: string | null;
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

export function DumplingCard({ dumpling, replies }: { dumpling: RevealedDumpling; replies?: Map<string, RevealedDumpling[]> }) {
  const nested = replies?.get(dumpling.id) ?? [];
  return (
    <Card style={{ padding: 14 }}>
      <Txt variant="title" style={{ paddingHorizontal: 6 }}>
        {dumpling.memberName}
      </Txt>
      {dumpling.replyToName && !replies?.has(dumpling.replyTo ?? '') && (
        <Txt variant="small" style={{ paddingHorizontal: 6 }}>Folding back to {dumpling.replyToName}</Txt>
      )}
      {dumpling.spark && <Txt variant="small" style={{ paddingHorizontal: 6 }}>{dumpling.spark}</Txt>}
      {dumpling.url && (dumpling.mediaType === 'video' ? <VideoClip url={dumpling.url} /> : <AudioClip url={dumpling.url} />)}
      {dumpling.caption && <Txt style={{ paddingHorizontal: 6 }}>{dumpling.caption}</Txt>}
      <ReactionBar dumplingId={dumpling.id} reactions={dumpling.reactions} />
      {replies && (
        <Button
          testID={`fold-back-${dumpling.id}`}
          kind="quiet"
          label={`Fold back to ${dumpling.memberName}`}
          onPress={() => router.push({ pathname: '/fold', params: { replyTo: dumpling.id, prompt: `Fold back to ${dumpling.memberName}` } })}
        />
      )}
      {nested.length > 0 && (
        <View style={styles.replies}>
          {nested.map((reply) => (
            <DumplingCard key={reply.id} dumpling={reply} replies={replies} />
          ))}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  video: { width: '100%', aspectRatio: 9 / 12, borderRadius: Radius.card - 8, overflow: 'hidden', backgroundColor: Palette.ink },
  audio: { aspectRatio: 3, backgroundColor: Palette.creamDeep, alignItems: 'center', justifyContent: 'center', gap: 4 },
  play: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playText: { fontSize: 44, color: Palette.cream },
  replies: { gap: 10, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: Palette.creamDeep },
});
