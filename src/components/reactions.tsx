import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useMutation } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette, Radius, Type } from '@/constants/dumpling';
import { useSession } from '@/lib/session';
import { uploadToConvex } from '@/lib/upload';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

export const TAPS: { kind: string; emoji: string; label: string }[] = [
  { kind: 'heart', emoji: '❤️', label: 'Love' },
  { kind: 'laugh', emoji: '😂', label: 'Laugh' },
  { kind: 'wow', emoji: '😮', label: 'Wow' },
  { kind: 'yum', emoji: '🥟', label: 'Yum' },
  { kind: 'cry', emoji: '🥹', label: 'Aww' },
];

export type ReactionSummary = {
  counts: Record<string, number>;
  mine: string[];
  voices: { id: Id<'reactions'>; memberName: string; url: string | null }[];
};

function VoiceChip({ url, memberName }: { url: string; memberName: string }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Play ${memberName}'s voice reaction`}
      onPress={() => {
        void player.seekTo(0);
        player.play();
      }}
      style={({ pressed }) => [styles.voice, pressed && { opacity: 0.7 }]}>
      <Text style={styles.voiceText}>{status.playing ? '🔊' : '▶︎'} {memberName}</Text>
    </Pressable>
  );
}

function VoiceButton({ dumplingId }: { dumplingId: Id<'dumplings'> }) {
  const { auth } = useSession();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const generateUploadUrl = useMutation(api.dumplings.generateUploadUrl);
  const sendVoice = useMutation(api.reactions.voice);
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'holding' | 'sending' | 'failed'>('idle');
  const phase = useRef<'idle' | 'starting' | 'recording' | 'sending'>('idle');
  const held = useRef(false);
  const holdToRecord = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const stopAndSend = async () => {
    if (phase.current !== 'recording') return;
    phase.current = 'sending';
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setState('sending');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (!recorder.uri || !auth) throw new Error('No recording');
      const storageId = await uploadToConvex(await generateUploadUrl({ ...auth }), recorder.uri, 'audio/mp4', () => {});
      await sendVoice({ ...auth, dumplingId, storageId: storageId as Id<'_storage'> });
      setState('idle');
    } catch {
      setState('failed');
    } finally {
      phase.current = 'idle';
    }
  };

  const start = async (hold: boolean) => {
    if (phase.current !== 'idle') return;
    phase.current = 'starting';
    holdToRecord.current = hold;
    setState('starting');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Microphone permission denied');
      if (hold && !held.current) {
        phase.current = 'idle';
        setState('idle');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (hold && !held.current) {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
        phase.current = 'idle';
        setState('idle');
        return;
      }
      recorder.record();
      phase.current = 'recording';
      setState(hold ? 'holding' : 'recording');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      timer.current = setTimeout(() => void stopAndSend(), 5000);
    } catch {
      phase.current = 'idle';
      setState('failed');
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  };

  const label = {
    idle: '🎙 Hold to react',
    starting: 'Getting ready…',
    recording: '■ Send',
    holding: 'Release to send',
    sending: 'Sending…',
    failed: '🎙 Retry',
  }[state];
  const recording = state === 'recording' || state === 'holding';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop and send voice reaction' : 'Record a voice reaction'}
      disabled={state === 'sending'}
      onPressIn={() => { held.current = true; }}
      onLongPress={() => void start(true)}
      onPressOut={() => {
        held.current = false;
        if (holdToRecord.current) void stopAndSend();
      }}
      onPress={() => void (phase.current === 'recording' ? stopAndSend() : start(false))}
      style={({ pressed }) => [styles.tap, recording && styles.recording, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.tapText, recording && { color: Palette.cream }]}>{label}</Text>
    </Pressable>
  );
}

export function ReactionBar({ dumplingId, reactions, dark }: { dumplingId: Id<'dumplings'>; reactions: ReactionSummary; dark?: boolean }) {
  const { auth } = useSession();
  const tap = useMutation(api.reactions.tap);
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.row}>
        {TAPS.map((t) => {
          const mine = reactions.mine.includes(t.kind);
          const count = reactions.counts[t.kind] ?? 0;
          return (
            <Pressable
              key={t.kind}
              testID={`react-${t.kind}`}
              accessibilityRole="button"
              accessibilityLabel={`${t.label}, ${count}`}
              accessibilityState={{ selected: mine }}
              onPress={() => {
                void Haptics.selectionAsync();
                if (auth) void tap({ ...auth, dumplingId, kind: t.kind });
              }}
              style={({ pressed }) => [styles.tap, dark && styles.tapDark, mine && styles.mine, pressed && { transform: [{ scale: 1.08 }] }]}>
              <Text style={[styles.tapText, dark && !mine && { color: Palette.cream }]}>
                {t.emoji} {count > 0 ? count : ''}
              </Text>
            </Pressable>
          );
        })}
        {!dark && <VoiceButton dumplingId={dumplingId} />}
      </View>
      {reactions.voices.length > 0 && (
        <View style={styles.row}>
          {reactions.voices.map((voice) =>
            voice.url ? <VoiceChip key={voice.id} url={voice.url} memberName={voice.memberName} /> : null,
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tap: { minHeight: 48, minWidth: 56, paddingHorizontal: 14, borderRadius: Radius.chip, backgroundColor: Palette.creamDeep, alignItems: 'center', justifyContent: 'center' },
  tapDark: { backgroundColor: 'rgba(255,246,233,0.18)' },
  mine: { backgroundColor: Palette.accent },
  recording: { backgroundColor: Palette.danger },
  tapText: { fontSize: 18, fontWeight: '700', color: Palette.ink, fontFamily: Type.family },
  voice: { minHeight: 44, paddingHorizontal: 14, borderRadius: Radius.chip, backgroundColor: Palette.card, borderWidth: 1, borderColor: Palette.creamDeep, justifyContent: 'center' },
  voiceText: { fontSize: 16, color: Palette.ink, fontFamily: Type.family },
});
