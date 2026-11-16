import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus, useAudioRecorder } from 'expo-audio';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
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

function PhotoReview({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Your photo Fold" />;
}

/** The photo shutter: one tap takes the picture. */
function ShutterButton({ size, onPress, disabled }: { size: number; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      testID="shutter-button"
      accessibilityRole="button"
      accessibilityLabel="Take a photo"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, borderWidth: 4, borderColor: Color.nightText, padding: 5 },
        disabled && { opacity: 0.4 },
        pressed && { transform: [{ scale: 0.92 }] },
      ]}>
      <View style={{ flex: 1, borderRadius: size, backgroundColor: Color.nightText }} />
    </Pressable>
  );
}

type Mode = 'video' | 'photo' | 'audio';
const MODES: { key: Mode; label: string; icon: 'video' | 'photo' | 'mic' }[] = [
  { key: 'video', label: 'Video', icon: 'video' },
  { key: 'photo', label: 'Photo', icon: 'photo' },
  { key: 'audio', label: 'Voice', icon: 'mic' },
];

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
  const [mode, setMode] = useState<Mode>(voiceDefault ? 'audio' : 'video');
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [snapping, setSnapping] = useState(false);
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

  const snap = async () => {
    if (!camera.current || !cameraReady || snapping) return;
    setError(null);
    setSnapping(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const photo = await camera.current.takePictureAsync({ quality: 0.7, mirror: facing === 'front' });
      if (!photo?.uri) throw new Error('No photo');
      setTake({ uri: photo.uri, mediaType: 'photo' });
      setPhase('review');
    } catch {
      setError('The camera could not take that photo. Try again.');
    } finally {
      setSnapping(false);
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

  const usesCamera = mode !== 'audio';
  // Photos need only the camera; video also needs the microphone.
  const needsCamera = usesCamera && (!cameraPermission?.granted || (mode === 'video' && !micPermission?.granted));
  const blocked = usesCamera && cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain;
  const buttonSize = elder ? 112 : 84;

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        {onClose ? <IconButton icon="close" label="Close" tone="dark" onPress={onClose} /> : <View style={{ width: 44 }} />}
        {!elder && phase !== 'review' ? (
          <View style={styles.modes} accessibilityRole="radiogroup">
            {MODES.map((m) => (
              <Pressable
                key={m.key}
                testID={`mode-${m.key}`}
                accessibilityRole="radio"
                accessibilityState={{ selected: mode === m.key }}
                disabled={phase === 'recording'}
                onPress={() => setMode(m.key)}
                style={[styles.mode, mode === m.key && styles.modeOn]}>
                <Icon name={m.icon} size={16} color={mode === m.key ? Color.text : Color.nightSoft} />
                <Text style={[styles.modeText, mode === m.key && { color: Color.text }]}>{m.label}</Text>
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
          take.mediaType === 'video' ? <VideoReview uri={take.uri} /> : take.mediaType === 'photo' ? <PhotoReview uri={take.uri} /> : <AudioReview uri={take.uri} />
        ) : usesCamera && !needsCamera ? (
          <>
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing={facing}
              mode={mode === 'photo' ? 'picture' : 'video'}
              mirror={facing === 'front'}
              onCameraReady={() => setCameraReady(true)}
              onMountError={() => {
                setMode('audio');
                setError('There is no camera here, so this Fold is voice only.');
              }}
            />
            {phase !== 'recording' && (
              <Pressable
                testID="flip-camera"
                accessibilityRole="button"
                accessibilityLabel={facing === 'front' ? 'Switch to the back camera' : 'Switch to the front camera'}
                hitSlop={8}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setFacing((f) => (f === 'front' ? 'back' : 'front'));
                }}
                style={({ pressed }) => [styles.flip, pressed && { opacity: 0.7 }]}>
                <Icon name="flip" size={22} color={Color.nightText} />
              </Pressable>
            )}
          </>
        ) : usesCamera ? (
          <View style={styles.center}>
            <Icon name="camera" size={28} color={Color.nightSoft} />
            <Txt variant="callout" style={styles.why}>
              {blocked
                ? 'Camera access is off for Dumpling. Turn it on in Settings, or use your voice.'
                : mode === 'photo'
                  ? 'Dumpling uses your camera to take your photo.'
                  : 'Dumpling uses your camera and microphone to film your ten seconds.'}
            </Txt>
            <Button
              kind="primary"
              stretch={false}
              label={blocked ? 'Open Settings' : 'Allow camera'}
              onPress={async () => {
                if (blocked) return void Linking.openSettings();
                const cam = await requestCamera();
                if (mode === 'video') await requestMic();
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
            {mode === 'photo' ? (
              <ShutterButton size={buttonSize} onPress={() => void snap()} disabled={needsCamera || !cameraReady || snapping} />
            ) : (
              <RecordButton
                recording={phase === 'recording'}
                progress={progress}
                size={buttonSize}
                onPressIn={onPressIn}
                onPressOut={onPressOut}
                disabled={mode === 'video' && (needsCamera || !cameraReady)}
              />
            )}
            <Text style={[styles.hint, elder && { fontSize: 18 }]}>
              {mode === 'photo' ? 'Tap to take a photo' : phase === 'recording' ? 'Release or tap to stop' : elder ? 'Hold to record' : 'Hold to record · up to 10 seconds'}
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
  flip: { position: 'absolute', top: Space.md, right: Space.md, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(33,21,15,0.55)', alignItems: 'center', justifyContent: 'center' },
  hint: { color: Color.nightSoft, fontSize: 13, fontWeight: '500', fontFamily: Font.ui },
});
