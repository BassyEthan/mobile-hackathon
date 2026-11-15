import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/icon';
import { Button, IconButton, Txt } from '@/components/ui';
import { Color, Font, Radius, Space } from '@/constants/dumpling';
import type { Take } from '@/lib/outbox';

export const LIMIT_SECONDS = 10;
const HOLD_MS = 450;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function VideoReview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />;
}

function AudioReview({ uri }: { uri: string }) {
  const player = useAudioPlayer(uri);
  const status = useAudioPlayerStatus(player);
  return (
    <View style={styles.center}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause your voice Fold' : 'Play your voice Fold'}
        onPress={() => {
          if (status.playing) player.pause();
          else {
            void player.seekTo(0);
            player.play();
          }
        }}
        style={styles.voiceDisc}>
        <Icon name={status.playing ? 'pause' : 'play'} size={28} color={Color.nightText} />
      </Pressable>
      <Txt variant="callout" style={{ color: Color.nightSoft }}>Your voice Fold</Txt>
    </View>
  );
}

/** The record control: a ring fills over ten seconds. Hold to record, release to stop; a quick tap toggles. */
function RecordButton({ recording, progress, size, onPressIn, onPressOut, disabled }: { recording: boolean; progress: Animated.Value; size: number; onPressIn: () => void; onPressOut: () => void; disabled?: boolean }) {
  const r = size / 2 - 4;
  const circumference = 2 * Math.PI * r;
  return (
    <Pressable
      testID="record-button"
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Record, up to ten seconds'}
      accessibilityHint={recording ? undefined : 'Hold to record and release to stop, or tap to start and tap again to stop'}
      disabled={disabled}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[{ width: size, height: size }, disabled && { opacity: 0.4 }]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={Color.nightLine} strokeWidth={4} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={Color.brand}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[styles.core, { margin: size * 0.14, borderRadius: recording ? Radius.chip : size }, recording && { margin: size * 0.3 }]} />
    </Pressable>
  );
}

export function Recorder({
  prompt,
  onDone,
  onClose,
  elder,
  voiceDefault,
  doneLabel = 'Fold it',
}: {
  prompt?: string | null;
  /** sparkKept is false when the person hid the spark, which makes this a free Fold. */
  onDone: (take: Take, sparkKept: boolean) => void;
  onClose?: () => void;
  elder?: boolean;
  voiceDefault?: boolean;
  doneLabel?: string;
}) {
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const camera = useRef<CameraView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [mode, setMode] = useState<'video' | 'audio'>(voiceDefault ? 'audio' : 'video');
  const [cameraReady, setCameraReady] = useState(false);
  const [phase, setPhase] = useState<'ready' | 'recording' | 'review'>('ready');
  const [take, setTake] = useState<Take | null>(null);
  const [retakesLeft, setRetakesLeft] = useState(1);
  const [sparkShown, setSparkShown] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [progress] = useState(() => new Animated.Value(0));
  const pressedAt = useRef(0);
  const live = useRef(false);
  const audioTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (audioTimer.current) clearTimeout(audioTimer.current);
  }, []);

  const runRing = () => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: LIMIT_SECONDS * 1000, easing: Easing.linear, useNativeDriver: false }).start();
  };

  const finishAudio = async () => {
    if (audioTimer.current) clearTimeout(audioTimer.current);
    audioTimer.current = null;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    } catch {}
    live.current = false;
    progress.stopAnimation();
    if (recorder.uri) {
      setTake({ uri: recorder.uri, mediaType: 'audio' });
      setPhase('review');
    } else setPhase('ready');
  };

  const start = async () => {
    setError(null);
    if (mode === 'video') {
      if (!camera.current || !cameraReady) return;
      live.current = true;
      setPhase('recording');
      runRing();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        const result = await camera.current.recordAsync({ maxDuration: LIMIT_SECONDS });
        live.current = false;
        progress.stopAnimation();
        if (!result?.uri) throw new Error('No video');
        setTake({ uri: result.uri, mediaType: 'video' });
        setPhase('review');
      } catch {
        live.current = false;
        setError('The camera stopped early. Try again, or switch to voice.');
        setPhase('ready');
      }
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError('Dumpling needs your microphone to record your voice. You can allow it in Settings.');
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      live.current = true;
      setPhase('recording');
      runRing();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      audioTimer.current = setTimeout(() => void finishAudio(), LIMIT_SECONDS * 1000);
    } catch {
      setError('The microphone is busy. Try again in a moment.');
    }
  };

  const stop = () => {
    if (!live.current) return;
    if (mode === 'video') camera.current?.stopRecording();
    else void finishAudio();
  };

  const onPressIn = () => {
    if (phase === 'recording') {
      stop();
      return;
    }
    pressedAt.current = Date.now();
    void start();
  };
  const onPressOut = () => {
    // A hold ends on release; a quick tap keeps recording until the next tap.
    if (live.current && Date.now() - pressedAt.current >= HOLD_MS) stop();
  };

  const needsCamera = mode === 'video' && (!cameraPermission?.granted || !micPermission?.granted);
  const blocked = mode === 'video' && cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain;
  const buttonSize = elder ? 112 : 84;

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        {onClose ? <IconButton icon="close" label="Close" tone="dark" onPress={onClose} /> : <View style={{ width: 44 }} />}
        {!elder && phase !== 'review' ? (
          <View style={styles.modes} accessibilityRole="radiogroup">
            {(['video', 'audio'] as const).map((m) => (
              <Pressable
                key={m}
                testID={`mode-${m}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === m }}
                disabled={phase === 'recording'}
                onPress={() => setMode(m)}
                style={[styles.mode, mode === m && styles.modeOn]}>
                <Icon name={m === 'video' ? 'video' : 'mic'} size={16} color={mode === m ? Color.text : Color.nightSoft} />
                <Text style={[styles.modeText, mode === m && { color: Color.text }]}>{m === 'video' ? 'Video' : 'Voice only'}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <View />
        )}
        <View style={{ width: 44 }} />
      </View>

      {prompt && sparkShown && phase !== 'review' && (
        <View style={styles.spark}>
          <Icon name="spark" size={16} color={Color.brand} />
          <Text style={[styles.sparkText, elder && { fontSize: 19, lineHeight: 25 }]} numberOfLines={3}>{prompt}</Text>
          {!elder && (
            <Pressable accessibilityRole="button" accessibilityLabel="Hide the spark" hitSlop={10} onPress={() => setSparkShown(false)}>
              <Icon name="close" size={16} color={Color.nightSoft} />
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.stage}>
        {take && phase === 'review' ? (
          take.mediaType === 'video' ? <VideoReview uri={take.uri} /> : <AudioReview uri={take.uri} />
        ) : mode === 'video' && !needsCamera ? (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="front"
            mode="video"
            onCameraReady={() => setCameraReady(true)}
            onMountError={() => {
              setMode('audio');
              setError('There is no camera here, so this Fold is voice only.');
            }}
          />
        ) : mode === 'video' ? (
          <View style={styles.center}>
            <Icon name="camera" size={28} color={Color.nightSoft} />
            <Txt variant="callout" style={styles.why}>
              {blocked ? 'Camera access is off for Dumpling. Turn it on in Settings, or use your voice.' : 'Dumpling uses your camera and microphone to film your ten seconds.'}
            </Txt>
            <Button
              kind="primary"
              stretch={false}
              label={blocked ? 'Open Settings' : 'Allow camera'}
              onPress={async () => {
                if (blocked) return void Linking.openSettings();
                const cam = await requestCamera();
                await requestMic();
                if (!cam.granted && !cam.canAskAgain) setError('Camera is off. You can still Fold with your voice.');
              }}
            />
            <Button kind="onDark" stretch={false} size="sm" icon="mic" label="Use my voice instead" onPress={() => setMode('audio')} />
          </View>
        ) : (
          <View style={styles.center}>
            <Icon name={phase === 'recording' ? 'voice' : 'mic'} size={32} color={phase === 'recording' ? Color.brand : Color.nightSoft} />
            <Txt variant="callout" style={styles.why}>{phase === 'recording' ? 'Listening…' : 'Voice only. No camera, just you.'}</Txt>
          </View>
        )}
      </View>

      {error && <Txt variant="meta" style={{ color: Color.nightSoft, textAlign: 'center' }}>{error}</Txt>}

      <View style={styles.controls}>
        {phase === 'review' ? (
          <View style={{ gap: Space.sm, alignSelf: 'stretch' }}>
            <Button testID="send-fold" size="lg" icon="send" label={doneLabel} onPress={() => take && onDone(take, !!prompt && sparkShown)} />
            {retakesLeft > 0 && (
              <Button
                testID="retake"
                kind="onDark"
                label="Retake"
                onPress={() => {
                  setRetakesLeft((n) => n - 1);
                  setTake(null);
                  progress.setValue(0);
                  setPhase('ready');
                }}
              />
            )}
          </View>
        ) : (
          <>
            <RecordButton
              recording={phase === 'recording'}
              progress={progress}
              size={buttonSize}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
              disabled={mode === 'video' && (needsCamera || !cameraReady)}
            />
            <Text style={[styles.hint, elder && { fontSize: 18 }]}>
              {phase === 'recording' ? 'Release or tap to stop' : elder ? 'Hold to record' : 'Hold to record · up to 10 seconds'}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.night, gap: Space.md },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Space.sm },
  modes: { flexDirection: 'row', backgroundColor: Color.nightSurface, borderRadius: Radius.chip, padding: 3 },
  mode: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 9 },
  modeOn: { backgroundColor: Color.nightText },
  modeText: { color: Color.nightSoft, fontSize: 14, fontWeight: '600', fontFamily: Font.ui },
  spark: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, marginHorizontal: Space.gutter, paddingHorizontal: Space.md, paddingVertical: 10, borderRadius: Radius.chip, backgroundColor: Color.nightSurface },
  sparkText: { flex: 1, color: Color.nightText, fontSize: 15, lineHeight: 20, fontFamily: Font.ui },
  stage: { flex: 1, marginHorizontal: Space.md, borderRadius: Radius.card, overflow: 'hidden', backgroundColor: Color.nightSurface },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md, padding: Space.xl },
  why: { color: Color.nightText, textAlign: 'center', fontWeight: '400' },
  voiceDisc: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(251,244,236,0.12)', alignItems: 'center', justifyContent: 'center' },
  controls: { alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.gutter, paddingBottom: Space.sm, minHeight: 130, justifyContent: 'center' },
  core: { flex: 1, backgroundColor: Color.brand },
  hint: { color: Color.nightSoft, fontSize: 13, fontWeight: '500', fontFamily: Font.ui },
});
