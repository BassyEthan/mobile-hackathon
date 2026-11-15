import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioRecorder } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot } from '@/components/mascot';
import { Button, Txt } from '@/components/ui';
import { Palette, Radius } from '@/constants/dumpling';
import { useSession } from '@/lib/session';
import { uploadToConvex } from '@/lib/upload';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const LIMIT_SECONDS = 10;

type Phase = 'ready' | 'recording' | 'review' | 'uploading' | 'failed';
type Take = { uri: string; mediaType: 'video' | 'audio' };

function VideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

function AudioPreview({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  return (
    <View style={styles.audioStage}>
      <Mascot size={140} />
      <Button kind="secondary" label="Play back" onPress={() => { void player.seekTo(0); player.play(); }} />
    </View>
  );
}

export default function Fold() {
  const { fillingId, prompt } = useLocalSearchParams<{ fillingId: string; prompt?: string }>();
  const { token } = useSession();
  const insets = useSafeAreaInsets();
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const camera = useRef<CameraView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const generateUploadUrl = useMutation(api.dumplings.generateUploadUrl);
  const fold = useMutation(api.dumplings.fold);

  const [mode, setMode] = useState<'video' | 'audio'>('video');
  const [cameraReady, setCameraReady] = useState(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [take, setTake] = useState<Take | null>(null);
  const [retakesLeft, setRetakesLeft] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(LIMIT_SECONDS);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const audioTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (phase !== 'recording') return;
    const started = Date.now();
    const id = setInterval(() => {
      setSecondsLeft(Math.max(0, LIMIT_SECONDS - Math.floor((Date.now() - started) / 1000)));
    }, 250);
    return () => clearInterval(id);
  }, [phase]);

  const finishAudio = async () => {
    if (audioTimer.current) clearTimeout(audioTimer.current);
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    if (recorder.uri) {
      setTake({ uri: recorder.uri, mediaType: 'audio' });
      setPhase('review');
    } else {
      setPhase('ready');
    }
  };

  const startRecording = async () => {
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSecondsLeft(LIMIT_SECONDS);
    if (mode === 'video') {
      if (!camera.current) return;
      setPhase('recording');
      try {
        const result = await camera.current.recordAsync({ maxDuration: LIMIT_SECONDS });
        if (!result?.uri) throw new Error('No video');
        setTake({ uri: result.uri, mediaType: 'video' });
        setPhase('review');
      } catch {
        setError('The camera stopped early. Try again, or switch to voice.');
        setPhase('ready');
      }
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Dumpling needs the microphone for a voice Fold.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
    setPhase('recording');
    audioTimer.current = setTimeout(() => void finishAudio(), LIMIT_SECONDS * 1000);
  };

  const stopRecording = () => {
    if (mode === 'video') camera.current?.stopRecording();
    else void finishAudio();
  };

  const retake = () => {
    setRetakesLeft((n) => n - 1);
    setTake(null);
    setPhase('ready');
  };

  const send = async () => {
    if (!take || !token || !fillingId) return;
    setPhase('uploading');
    setProgress(0);
    setError(null);
    try {
      const url = await generateUploadUrl({ token });
      const storageId = await uploadToConvex(url, take.uri, take.mediaType === 'video' ? 'video/quicktime' : 'audio/mp4', setProgress);
      await fold({ token, fillingId: fillingId as Id<'fillings'>, storageId: storageId as Id<'_storage'>, mediaType: take.mediaType });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'The upload did not finish. Your clip is safe here.');
      setPhase('failed');
    }
  };

  const needsCamera = mode === 'video' && (!cameraPermission?.granted || !micPermission?.granted);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        <Button kind="quiet" label="Close" onPress={() => router.back()} />
        {phase === 'recording' && <Txt variant="title" style={{ color: Palette.cream }}>{secondsLeft}s</Txt>}
        {(phase === 'ready' || phase === 'recording') && (
          <Button
            kind="quiet"
            label={mode === 'video' ? 'Voice only' : 'Use camera'}
            disabled={phase === 'recording'}
            onPress={() => setMode(mode === 'video' ? 'audio' : 'video')}
          />
        )}
      </View>
      <Txt variant="title" style={styles.prompt}>
        {prompt}
      </Txt>

      <View style={styles.stage}>
        {take && phase !== 'recording' ? (
          take.mediaType === 'video' ? <VideoPreview uri={take.uri} /> : <AudioPreview uri={take.uri} />
        ) : mode === 'video' && !needsCamera ? (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="front"
            mode="video"
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => {
              setMode('audio');
              setError('No camera here, so this Fold is voice only.');
            }}
          />
        ) : mode === 'video' ? (
          <View style={styles.audioStage}>
            <Txt style={{ color: Palette.cream, textAlign: 'center' }}>Dumpling needs your camera and microphone to Fold.</Txt>
            <Button
              label="Allow camera"
              onPress={async () => {
                const cam = await requestCamera();
                await requestMic();
                if (!cam.granted) setMode('audio');
              }}
            />
          </View>
        ) : (
          <View style={styles.audioStage}>
            <Mascot size={140} mood={phase === 'recording' ? 'wow' : 'smile'} />
            <Txt style={{ color: Palette.cream }}>{phase === 'recording' ? 'Listening…' : 'Voice Fold, up to ten seconds'}</Txt>
          </View>
        )}
      </View>

      {error && <Txt style={styles.error}>{error}</Txt>}

      {phase === 'ready' && (
        <Button
          testID="record-button"
          big
          label="Fold"
          onPress={startRecording}
          disabled={(mode === 'video' && (needsCamera || !cameraReady))}
        />
      )}
      {phase === 'recording' && <Button big label="Done" onPress={stopRecording} />}
      {phase === 'review' && (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Button kind="secondary" label={retakesLeft > 0 ? 'Retake' : 'No retakes left'} disabled={retakesLeft === 0} onPress={retake} />
          </View>
          <View style={{ flex: 1.4 }}>
            <Button testID="send-fold" label="Into the steamer" onPress={send} />
          </View>
        </View>
      )}
      {phase === 'uploading' && (
        <View style={{ gap: 8 }}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>
          <Txt style={{ color: Palette.cream, textAlign: 'center' }}>Steaming… {Math.round(progress * 100)}%</Txt>
        </View>
      )}
      {phase === 'failed' && <Button label="Retry upload" onPress={send} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Palette.ink, paddingHorizontal: 18, gap: 12 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  prompt: { color: Palette.cream, textAlign: 'center' },
  stage: { flex: 1, borderRadius: Radius.card, overflow: 'hidden', backgroundColor: '#2A1E17' },
  audioStage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  error: { color: Palette.creamDeep, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 12 },
  progressTrack: { height: 14, borderRadius: 7, backgroundColor: 'rgba(255,246,233,0.2)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: Palette.accent },
});
