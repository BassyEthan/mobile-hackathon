import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import { useMutation } from 'convex/react';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Color, Font, Radius, Space } from '@/constants/dumpling';
import { useSession } from '@/lib/session';
import { uploadToConvex } from '@/lib/upload';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

/** Emoji are the content of a reaction, never the shape of the control around it. */
export const TAPS: { kind: string; emoji: string; label: string }[] = [
  { kind: 'heart', emoji: '❤️', label: 'Love' },
  { kind: 'laugh', emoji: '😂', label: 'Laugh' },
  { kind: 'wow', emoji: '😮', label: 'Wow' },
  { kind: 'cry', emoji: '🥹', label: 'Aww' },
  { kind: 'yum', emoji: '🥟', label: 'Yum' },
];

export type ReactionSummary = {
  counts: Record<string, number>;
  mine: string[];
  voices: { id: Id<'reactions'>; memberName: string; url: string | null }[];
};

export function reactionTotal(r: ReactionSummary) {
  return Object.values(r.counts).reduce((a, b) => a + b, 0);
}

export function ReactionRow({ dumplingId, reactions, dark }: { dumplingId: Id<'dumplings'>; reactions: ReactionSummary; dark?: boolean }) {
  const { auth } = useSession();
  const tap = useMutation(api.reactions.tap);
  return (
    <View style={styles.row}>
      {TAPS.map((t) => {
        const mine = reactions.mine.includes(t.kind);
        const count = reactions.counts[t.kind] ?? 0;
        return (
          <Pressable
            key={t.kind}
            testID={`react-${t.kind}`}
            accessibilityRole="button"
            accessibilityLabel={`${t.label}${count ? `, ${count}` : ''}`}
            accessibilityState={{ selected: mine }}
            hitSlop={4}
            onPress={() => {
              void Haptics.selectionAsync();
              if (auth) void tap({ ...auth, dumplingId, kind: t.kind });
            }}
            style={({ pressed }) => [styles.chip, dark ? styles.chipDark : styles.chipLight, mine && (dark ? styles.mineDark : styles.mineLight), pressed && { transform: [{ scale: 0.94 }] }]}>
            <Text style={styles.emoji}>{t.emoji}</Text>
            {count > 0 && <Text style={[styles.count, { color: dark ? Color.nightText : mine ? Color.brandDeep : Color.textSoft }]}>{count}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

function VoiceChip({ url, memberName, dark }: { url: string; memberName: string; dark?: boolean }) {
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
      style={({ pressed }) => [styles.chip, dark ? styles.chipDark : styles.chipLight, { paddingHorizontal: 12 }, pressed && { opacity: 0.7 }]}>
      <Icon name={status.playing ? 'voice' : 'play'} size={14} color={dark ? Color.nightText : Color.brandDeep} />
      <Text style={[styles.count, { color: dark ? Color.nightText : Color.text }]}>{memberName}</Text>
    </Pressable>
  );
}

export function VoiceReactions({ reactions, dark }: { reactions: ReactionSummary; dark?: boolean }) {
  if (reactions.voices.length === 0) return null;
  return (
    <View style={styles.row}>
      {reactions.voices.map((voice) => (voice.url ? <VoiceChip key={voice.id} url={voice.url} memberName={voice.memberName} dark={dark} /> : null))}
    </View>
  );
}

/**
 * Hold the mic to leave a voice reaction (up to five seconds), release to send. A tap starts it and a second tap sends,
 * so it also works for people who cannot hold.
 */
export function useVoiceNote(onSend: (storageId: Id<'_storage'>) => Promise<unknown>, limitMs = 5000) {
  const { auth } = useSession();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const generateUploadUrl = useMutation(api.dumplings.generateUploadUrl);
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'sending' | 'sent' | 'failed' | 'denied'>('idle');
  const phase = useRef<'idle' | 'starting' | 'recording' | 'sending'>('idle');
  const pressedAt = useRef(0);
  const held = useRef(false);
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
      await onSend(storageId as Id<'_storage'>);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState('sent');
      setTimeout(() => setState((s) => (s === 'sent' ? 'idle' : s)), 1800);
    } catch {
      setState('failed');
    } finally {
      phase.current = 'idle';
    }
  };

  const start = async () => {
    if (phase.current !== 'idle') return;
    phase.current = 'starting';
    setState('starting');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        phase.current = 'idle';
        setState('denied');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      phase.current = 'recording';
      setState('recording');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      timer.current = setTimeout(() => void stopAndSend(), limitMs);
      // A hold that ended while the microphone was warming up sends straight away.
      if (!held.current && Date.now() - pressedAt.current >= 450) void stopAndSend();
    } catch {
      phase.current = 'idle';
      setState('failed');
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  };

  return {
    state,
    onPressIn: () => {
      held.current = true;
      if (phase.current === 'recording') return void stopAndSend();
      pressedAt.current = Date.now();
      void start();
    },
    onPressOut: () => {
      held.current = false;
      if (phase.current === 'recording' && Date.now() - pressedAt.current >= 450) void stopAndSend();
    },
  };
}

const VOICE_LABEL = {
  idle: 'Hold to react',
  starting: 'Getting ready…',
  recording: 'Release to send',
  sending: 'Sending…',
  sent: 'Sent',
  failed: 'Try again',
  denied: 'Allow microphone',
};

export function VoiceReactButton({ dumplingId, dark, compact }: { dumplingId: Id<'dumplings'>; dark?: boolean; compact?: boolean }) {
  const { auth } = useSession();
  const sendVoice = useMutation(api.reactions.voice);
  const voice = useVoiceNote(async (storageId) => auth && sendVoice({ ...auth, dumplingId, storageId }));
  const recording = voice.state === 'recording';
  const label = voice.state === 'denied' ? 'Dumpling needs the microphone for voice reactions' : VOICE_LABEL[voice.state];
  return (
    <Pressable
      testID="voice-react"
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Send voice reaction' : 'Record a voice reaction'}
      accessibilityHint="Hold to record up to five seconds, release to send"
      disabled={voice.state === 'sending'}
      onPressIn={voice.onPressIn}
      onPressOut={voice.onPressOut}
      style={({ pressed }) => [
        styles.voice,
        dark ? styles.voiceDark : styles.voiceLight,
        recording && styles.voiceLive,
        pressed && !recording && { opacity: 0.8 },
      ]}>
      <Icon name={recording ? 'voice' : voice.state === 'sent' ? 'check' : 'mic'} size={20} color={recording ? Color.surface : dark ? Color.nightText : Color.brandDeep} />
      {!compact && <Text numberOfLines={1} style={[styles.voiceText, { color: recording ? Color.surface : dark ? Color.nightText : Color.text }]}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 36, minWidth: 44, paddingHorizontal: 10, borderRadius: Radius.chip, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1 },
  chipLight: { backgroundColor: Color.surface, borderColor: Color.border },
  chipDark: { backgroundColor: 'rgba(251,244,236,0.10)', borderColor: 'transparent' },
  mineLight: { backgroundColor: Color.brandTint, borderColor: Color.brand },
  mineDark: { backgroundColor: 'rgba(232,117,61,0.32)', borderColor: Color.brand },
  emoji: { fontSize: 16 },
  count: { fontSize: 13, fontWeight: '600', fontFamily: Font.ui },
  voice: { minHeight: 48, borderRadius: Radius.button, paddingHorizontal: Space.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.sm },
  voiceLight: { backgroundColor: Color.surface, borderWidth: 1, borderColor: Color.border },
  voiceDark: { backgroundColor: 'rgba(251,244,236,0.12)' },
  voiceLive: { backgroundColor: Color.brand },
  voiceText: { fontSize: 15, fontWeight: '600', fontFamily: Font.ui, flexShrink: 1 },
});
