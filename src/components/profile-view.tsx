import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

import { AskSheet } from '@/components/ask-the-table';
import { Avatar } from '@/components/avatar';
import { AwardEmblem } from '@/components/award-emblem';
import { Icon } from '@/components/icon';
import { DumplingLoader } from '@/components/loader';
import { Button, Divider, IconButton, Loading, NavBar, Row, Screen, SectionHeader, StateView, Toggle, Txt } from '@/components/ui';
import { Color, Radius, Space, languageLabel } from '@/constants/dumpling';
import { pickAndUploadAvatar } from '@/lib/avatar';
import { longDate, useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

type Profile = NonNullable<FunctionReturnType<typeof api.members.profile>>;
type Tile = Profile['clips'][number];

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** Your own picture, tappable: choose a photo from your library, or remove the one you have. */
function EditableAvatar({ name, uri }: { name: string; uri: string | null }) {
  const { auth } = useSession();
  const generateUploadUrl = useMutation(api.dumplings.generateUploadUrl);
  const setAvatar = useMutation(api.tables.setAvatar);
  const [busy, setBusy] = useState(false);
  if (!auth) return <Avatar name={name} uri={uri} size={88} />;

  const choose = async (source: 'camera' | 'library') => {
    setBusy(true);
    try {
      const storageId = await pickAndUploadAvatar(source, () => generateUploadUrl({ ...auth }));
      if (storageId) await setAvatar({ ...auth, storageId: storageId as Id<'_storage'> });
    } catch (e) {
      Alert.alert('Could not add your picture', e instanceof Error ? (e as { data?: string }).data ?? e.message : 'Try again.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await setAvatar({ ...auth, storageId: null });
    } finally {
      setBusy(false);
    }
  };
  const onPress = () => {
    Alert.alert('Profile picture', undefined, [
      { text: 'Take a photo', onPress: () => void choose('camera') },
      { text: 'Choose from library', onPress: () => void choose('library') },
      ...(uri ? [{ text: 'Remove photo', style: 'destructive' as const, onPress: () => void remove() }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <Pressable
      testID="edit-avatar"
      accessibilityRole="button"
      accessibilityLabel={uri ? 'Change your profile picture' : 'Add a profile picture'}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.8 }}>
      <Avatar name={name} uri={uri} size={88} ring />
      {busy ? (
        <View style={styles.avatarBusy}><DumplingLoader compact size={34} label="Saving your picture" /></View>
      ) : (
        <View style={styles.avatarBadge}><Icon name="camera" size={16} color={Color.surface} /></View>
      )}
    </Pressable>
  );
}

function Thumb({ tile, size }: { tile: Tile; size: number }) {
  const player = useVideoPlayer(tile.mediaType === 'video' ? tile.url : null, (p) => {
    p.muted = true;
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Clip from ${longDate(tile.date)}${tile.sealed ? ', sealed until the Feast' : ''}`}
      accessibilityState={{ disabled: tile.sealed }}
      disabled={tile.sealed}
      onPress={() => router.push({ pathname: '/clip/[id]', params: { id: tile.id, date: tile.date } })}
      style={({ pressed }) => [styles.thumb, { width: size, height: size * 1.25 }, pressed && { opacity: 0.8 }]}>
      {tile.mediaType === 'video' && tile.url ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
      ) : tile.mediaType === 'photo' && tile.url ? (
        <Image source={{ uri: tile.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
      ) : (
        <Icon name="voice" size={20} color={Color.brandDeep} />
      )}
      {tile.sealed && (
        <View style={styles.sealed}>
          <Icon name="lock" size={11} color={Color.nightText} />
        </View>
      )}
    </Pressable>
  );
}

function monthKey(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function PhraseRow({ phrase }: { phrase: Profile['phrases'][number] }) {
  const player = useAudioPlayer(phrase.url ?? undefined);
  const status = useAudioPlayerStatus(player);
  return (
    <Row
      title={phrase.phrase}
      detail={phrase.meaning ? `“${phrase.meaning}”` : null}
      trailing={
        <IconButton
          icon={status.playing ? 'pause' : 'play'}
          label={`Replay your attempt at ${phrase.phrase}`}
          filled
          disabled={!phrase.url}
          onPress={() => {
            if (status.playing) player.pause();
            else {
              void player.seekTo(0);
              player.play();
            }
          }}
        />
      }
    />
  );
}

export function ProfileView({ targetId }: { targetId: Id<'members'> }) {
  const { auth } = useSession();
  const me = useMe();
  const date = useToday(me?.timeZone);
  const profile = useQuery(api.members.profile, auth ? { ...auth, targetId } : 'skip');
  const day = useQuery(api.today.get, auth && date ? { ...auth, date } : 'skip');
  const setElder = useMutation(api.tables.setElder);
  const { width } = useWindowDimensions();
  const [askOpen, setAskOpen] = useState(false);

  if (profile === null) {
    return (
      <Screen header={<NavBar onBack={back} />}>
        <StateView icon="person" title="This person is no longer at your Table" action={<Button kind="secondary" label="Back to your Table" onPress={() => router.replace('/table')} />} />
      </Screen>
    );
  }
  if (!profile || !me) return <Screen scroll={false} header={<NavBar onBack={back} />}><Loading /></Screen>;

  const size = Math.floor((Math.min(width, 640) - Space.gutter * 2 - Space.sm * 2) / 3);
  const months = new Map<string, Tile[]>();
  for (const c of profile.clips) months.set(monthKey(c.date), [...(months.get(monthKey(c.date)) ?? []), c]);
  const first = profile.displayName.split(' ')[0];

  return (
    <Screen
      header={
        <NavBar
          onBack={back}
          right={profile.isMe ? <IconButton testID="open-settings" icon="settings" label="Settings" onPress={() => router.push('/settings')} /> : undefined}
        />
      }
      gap={Space.xl}>
      <View style={styles.head}>
        {profile.isMe ? <EditableAvatar name={profile.displayName} uri={profile.avatarUrl} /> : <Avatar name={profile.displayName} uri={profile.avatarUrl} size={88} ring />}
        <View style={{ flex: 1, gap: 4 }}>
          <Txt variant="display" numberOfLines={2}>{profile.displayName}</Txt>
          {profile.nickname && <Txt variant="meta">Family calls {profile.isMe ? 'you' : 'them'} {profile.nickname}</Txt>}
          <View style={styles.langs}>
            <Icon name="language" size={14} color={Color.textSoft} />
            <Txt variant="meta">{profile.languages.map(languageLabel).join(', ')}</Txt>
          </View>
        </View>
      </View>

      {!profile.isMe && (
        <Button testID="ask-them" icon="ask" label={`Ask ${first} something`} onPress={() => setAskOpen(true)} />
      )}
      {!profile.isMe && me.role === 'host' && auth && (
        <Toggle
          testID="elder-toggle"
          label="Elder mode"
          detail="Larger text, the spark read aloud, one big record button and no tab bar."
          value={profile.isElder}
          onChange={(v) => void setElder({ ...auth, targetId: profile.id, isElder: v })}
        />
      )}

      <View style={{ gap: Space.md }}>
        <SectionHeader title={profile.isMe ? 'Your Dumplings' : `${first}’s Dumplings`} detail={profile.isMe ? undefined : 'The moments you can see.'} />
        {profile.clips.length === 0 ? (
          <Txt variant="meta">{profile.isMe ? 'Your Folds will collect here, month by month.' : `${first} has not shared anything you can see yet.`}</Txt>
        ) : (
          [...months.entries()].map(([month, tiles]) => (
            <View key={month} style={{ gap: Space.sm }}>
              <Txt variant="meta">{month}</Txt>
              <View style={styles.grid}>{tiles.map((t) => <Thumb key={t.id} tile={t} size={size} />)}</View>
            </View>
          ))
        )}
      </View>

      {profile.segment && (
        <View style={{ gap: Space.sm }}>
          <SectionHeader title={profile.isMe ? 'Your segment' : `${first}’s segment`} />
          <View style={styles.segment}>
            <Txt variant="eyebrow">Named by the Chef</Txt>
            <Txt variant="headline">{profile.segment.title}</Txt>
            {profile.segment.episodes.length === 0 ? (
              <Txt variant="meta">It has not appeared in a Feast yet.</Txt>
            ) : (
              profile.segment.episodes.map((e) => (
                <Row key={e.feastId} title={e.title} detail={`Week of ${longDate(e.weekOf)}`} onPress={() => router.push({ pathname: '/player/[id]', params: { id: e.feastId } })} />
              ))
            )}
          </View>
        </View>
      )}

      {profile.isMe && (
        <View style={{ gap: Space.xs }}>
          <SectionHeader title="Phrases you’ve learned" detail="Mother Tongue phrases you said back during a Feast." />
          {profile.phrases.length === 0 ? (
            <Txt variant="meta" style={{ marginTop: Space.sm }}>When a Feast teaches a phrase, hold “Say it back” to practise. Your attempts are kept here.</Txt>
          ) : (
            profile.phrases.map((p, i) => (
              <View key={p.id}>
                {i > 0 && <Divider />}
                <PhraseRow phrase={p} />
              </View>
            ))
          )}
        </View>
      )}

      {profile.awards.length > 0 && (
        <View style={{ gap: Space.md }}>
          <SectionHeader title="Golden Dumplings" />
          {profile.awards.map((a) => (
            <Pressable key={`${a.feastId}-${a.award}`} accessibilityRole="button" onPress={() => router.push({ pathname: '/player/[id]', params: { id: a.feastId } })} style={({ pressed }) => [styles.award, pressed && { opacity: 0.8 }]}>
              <AwardEmblem size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt variant="callout" style={{ fontWeight: '600' }}>{a.award}</Txt>
                <Txt variant="meta" numberOfLines={2}>{a.text}</Txt>
                <Txt variant="caption">Week of {longDate(a.weekOf)}</Txt>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {date && day && (
        <AskSheet visible={askOpen} onClose={() => setAskOpen(false)} date={date} members={day.members} to={profile.id} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  avatarBadge: { position: 'absolute', right: -2, bottom: -2, width: 30, height: 30, borderRadius: 15, backgroundColor: Color.brand, borderWidth: 2, borderColor: Color.ink, alignItems: 'center', justifyContent: 'center' },
  avatarBusy: { position: 'absolute', top: 0, left: 0, width: 88, height: 88, borderRadius: 44, backgroundColor: 'rgba(251,242,228,0.85)', alignItems: 'center', justifyContent: 'center' },
  langs: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  thumb: { borderRadius: Radius.chip, overflow: 'hidden', backgroundColor: Color.surface2, alignItems: 'center', justifyContent: 'center' },
  sealed: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(23,17,14,0.55)', alignItems: 'center', justifyContent: 'center' },
  segment: { backgroundColor: Color.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Color.border, padding: Space.lg, gap: Space.xs },
  award: { flexDirection: 'row', alignItems: 'center', gap: Space.md, padding: Space.md, borderRadius: Radius.tile, backgroundColor: Color.goldSoft },
});
