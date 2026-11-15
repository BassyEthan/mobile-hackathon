import { useMutation } from 'convex/react';
import type { FunctionArgs } from 'convex/server';
import { ConvexError } from 'convex/values';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { Button, Chip, Divider, Field, Loading, NavBar, Row, Screen, SectionHeader, Toggle, Txt } from '@/components/ui';
import { Color, LANGUAGES, Space } from '@/constants/dumpling';
import { enableNotifications } from '@/lib/notifications';
import { useMe, useSession } from '@/lib/session';
import { api } from '../../convex/_generated/api';

const back = () => (router.canGoBack() ? router.back() : router.replace('/profile'));
const HOURS = [6, 7, 8, 9, 10];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Patch = Omit<FunctionArgs<typeof api.tables.updateProfile>, 'token' | 'memberId'>;

/** Every setting on one screen, saved as soon as it changes. */
export default function Settings() {
  const { auth, signOut } = useSession();
  const me = useMe();
  const update = useMutation(api.tables.updateProfile);
  const savePushToken = useMutation(api.tables.savePushToken);
  const deleteAccount = useMutation(api.tables.deleteAccount);
  const [name, setName] = useState<string | null>(null);
  const [nickname, setNickname] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notifyNote, setNotifyNote] = useState<string | null>(null);

  if (!me || !auth) return <Screen scroll={false} header={<NavBar onBack={back} title="Settings" />}><Loading /></Screen>;

  const save = async (patch: Patch) => {
    setError(null);
    try {
      await update({ ...auth, ...patch });
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'That did not save. Check your connection.');
    }
  };
  const birthMonth = me.birthday?.month ?? null;

  return (
    <Screen header={<NavBar onBack={back} title="Settings" />} gap={Space.xl}>
      {error && <Txt variant="meta" style={{ color: Color.danger }}>{error}</Txt>}

      <View style={{ gap: Space.md }}>
        <SectionHeader title="You" />
        <Field label="Your name" value={name ?? me.displayName} onChangeText={setName} onEndEditing={() => name && name !== me.displayName && void save({ displayName: name })} maxLength={40} />
        <Field label="What your family calls you" placeholder="Optional" value={nickname ?? me.nickname ?? ''} onChangeText={setNickname} onEndEditing={() => nickname !== null && void save({ nickname })} maxLength={40} />
      </View>

      <View style={{ gap: Space.md }}>
        <SectionHeader title="Notifications" detail="At most two a day, only when someone folds, asks you something, or the Feast is served." />
        {!me.hasPushToken && (
          <Button
            kind="secondary"
            icon="bell"
            label="Turn on notifications"
            onPress={async () => {
              const token = await enableNotifications();
              if (token) await savePushToken({ ...auth, pushToken: token });
              else setNotifyNote('Notifications are off for Dumpling. You can turn them on in your phone’s Settings.');
            }}
          />
        )}
        {notifyNote && <Txt variant="meta">{notifyNote}</Txt>}
        <Txt variant="meta">Not before</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {HOURS.map((h) => <Chip key={h} label={`${h} AM`} selected={me.notifyFrom === h} onPress={() => void save({ notifyFrom: h })} />)}
        </View>
      </View>

      <View style={{ gap: Space.md }}>
        <SectionHeader title="Captions" detail="Clips and the Chef are captioned in this language." />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LANGUAGES.map((l) => <Chip key={l.code} label={l.label} selected={me.language === l.code} onPress={() => void save({ language: l.code })} />)}
        </View>
      </View>

      <View style={{ gap: Space.xs }}>
        <SectionHeader title="Folding" />
        <Toggle testID="voice-default" label="Voice only by default" detail="Fold opens with the microphone instead of the camera." value={me.voiceOnly} onChange={(v) => void save({ voiceOnly: v })} />
      </View>

      <View style={{ gap: Space.md }}>
        <SectionHeader title="Birthday" detail="So the family can send a sealed wish the week before." />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {MONTHS.map((m, i) => (
            <Chip key={m} label={m} selected={birthMonth === i + 1} onPress={() => void save({ birthday: { month: i + 1, day: me.birthday?.day ?? 1 } })} />
          ))}
        </ScrollView>
        <View style={{ width: 120 }}>
          <Field
            label="Day"
            keyboardType="number-pad"
            maxLength={2}
            value={day ?? (me.birthday ? String(me.birthday.day) : '')}
            onChangeText={(t) => setDay(t.replace(/\D/g, ''))}
            onEndEditing={() => {
              const d = Number(day);
              if (birthMonth && d >= 1 && d <= 31) void save({ birthday: { month: birthMonth, day: d } });
            }}
          />
        </View>
      </View>

      <View>
        <Divider />
        <Row
          testID="delete-account"
          destructive
          title="Delete my account"
          detail="Removes your seat and everything you recorded."
          onPress={() =>
            Alert.alert('Delete your account?', 'Your clips, voice reactions and phrases will be deleted for good. This cannot be undone.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  signOut((seat) => deleteAccount({ ...seat })).catch((e) =>
                    Alert.alert('Could not delete your account', e instanceof ConvexError ? String(e.data) : 'Check your connection and try again.'),
                  );
                },
              },
            ])
          }
        />
      </View>
    </Screen>
  );
}
