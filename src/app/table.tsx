import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { router, type ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { Sheet } from '@/components/sheet';
import { Button, Choice, Divider, Field, Loading, NavBar, Row, Screen, SectionHeader, StateView, Txt } from '@/components/ui';
import { Color, FEAST_TIMES, Space, feastTimeLabel, languageLabel } from '@/constants/dumpling';
import { guestLink, shareInvite } from '@/lib/invite';
import { useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../convex/_generated/api';

const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <Screen header={<NavBar onBack={back} title="Your Table" />}>
      <StateView mascot="wow" title="Your Table did not load" body="Check your connection, then try again." action={<Button label="Try again" onPress={() => void retry()} />} />
    </Screen>
  );
}

function GrandparentSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { auth } = useSession();
  const me = useMe();
  const addGuest = useMutation(api.tables.addGuest);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async () => {
    if (!auth || !me) return;
    setBusy(true);
    setError(null);
    try {
      const seat = await addGuest({ ...auth, displayName: name, phone });
      const body = `Hi ${name.trim()}, it's ${me.displayName}. Every Sunday our family makes a little show on Dumpling. Tap to watch, no app needed: ${guestLink(seat.token, seat.memberId)}`;
      const sep = Platform.OS === 'ios' ? '&' : '?';
      await Linking.openURL(`sms:${phone.replace(/[^\d+]/g, '')}${sep}body=${encodeURIComponent(body)}`).catch(() => {});
      setName('');
      setPhone('');
      onClose();
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'That did not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible={visible} title="Add a grandparent" onClose={onClose}>
      <Txt>They will get each Sunday’s Feast as a text message link. Nothing to install, no account to make.</Txt>
      <Field label="Their name" value={name} onChangeText={setName} placeholder="Grandma Lin" autoCapitalize="words" />
      <Field label="Their phone number" value={phone} onChangeText={setPhone} placeholder="+1 555 123 4567" keyboardType="phone-pad" textContentType="telephoneNumber" />
      {error && <Txt variant="meta" style={{ color: Color.danger }}>{error}</Txt>}
      <Button icon="send" label="Send them the link" busy={busy} disabled={!name.trim() || phone.replace(/\D/g, '').length < 7} onPress={() => void send()} />
    </Sheet>
  );
}

function RenameSheet({ visible, onClose, current }: { visible: boolean; onClose: () => void; current: string }) {
  const { auth } = useSession();
  const update = useMutation(api.tables.updateTable);
  const [name, setName] = useState(current);
  return (
    <Sheet visible={visible} title="Table name" onClose={onClose}>
      <Field value={name} onChangeText={setName} maxLength={40} autoFocus />
      <Button label="Save" disabled={!name.trim()} onPress={() => auth && void update({ ...auth, name }).then(onClose)} />
    </Sheet>
  );
}

export default function TableScreen() {
  const { auth, signOut } = useSession();
  const me = useMe();
  const date = useToday(me?.timeZone);
  const seats = useQuery(api.tables.seats, auth && date ? { ...auth, date } : 'skip');
  const updateTable = useMutation(api.tables.updateTable);
  const leave = useMutation(api.tables.leave);
  const [guestOpen, setGuestOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [feastOpen, setFeastOpen] = useState(false);

  if (!me || !seats) return <Screen scroll={false} header={<NavBar onBack={back} title="Your Table" />}><Loading /></Screen>;
  const host = me.role === 'host';
  const family = seats.filter((s) => s.role !== 'guest');
  const guests = seats.filter((s) => s.role === 'guest');

  return (
    <Screen header={<NavBar onBack={back} />} gap={Space.xl}>
      <View style={{ gap: 4 }}>
        <Txt variant="display">{me.tableName}</Txt>
        <Txt variant="meta">{family.length} at the table · Feast on Sundays at {feastTimeLabel(me.feastHour)}</Txt>
      </View>

      <Button testID="invite" icon="family" label="Invite someone" onPress={() => void shareInvite(me.tableName, me.joinCode, me.memberId)} />

      <View>
        {family.map((s, i) => (
          <View key={s.id}>
            {i > 0 && <Divider />}
            <Row
              testID={`seat-${s.id}`}
              leading={<Avatar name={s.displayName} size={44} folded={s.foldedToday} />}
              title={s.isMe ? `${s.displayName} (you)` : s.displayName}
              detail={[
                s.nickname ? `Called ${s.nickname}` : null,
                s.languages.map(languageLabel).join(', '),
                s.foldedToday ? 'Folded today' : 'Not yet today',
                s.segment ? `Segment: ${s.segment}` : null,
                s.isElder ? 'Elder mode' : null,
              ].filter(Boolean).join(' · ')}
              onPress={() => (s.isMe ? router.push('/profile') : router.push({ pathname: '/member/[id]', params: { id: s.id } }))}
            />
          </View>
        ))}
        {guests.map((g) => (
          <View key={g.id}>
            <Divider />
            <Row leading={<Avatar name={g.displayName} size={44} />} title={g.displayName} detail="Watches the Feast by text link" />
          </View>
        ))}
      </View>

      <Row
        testID="add-grandparent"
        leading={<View style={{ width: 44, alignItems: 'center' }}><Icon name="phone" color={Color.brandDeep} /></View>}
        title="Add a grandparent by phone number"
        detail="They receive the Feast as a link. No install."
        onPress={() => setGuestOpen(true)}
      />

      <View style={{ gap: Space.xs }}>
        <SectionHeader title="Table settings" detail={host ? undefined : 'Only the host can change these.'} />
        <Row title="Table name" detail={me.tableName} onPress={host ? () => setRenameOpen(true) : undefined} />
        <Divider />
        <Row title="Feast time" detail={`Sundays at ${feastTimeLabel(me.feastHour)}`} onPress={host ? () => setFeastOpen(true) : undefined} />
        <Divider />
        <Row title="Table code" detail={`${me.joinCode} · for anyone joining without the link`} />
        <Divider />
        <Row
          testID="leave-table"
          destructive
          title="Leave this Table"
          onPress={() =>
            Alert.alert('Leave this Table?', 'Your past clips stay in the family’s Feasts. You can rejoin with an invite.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Leave',
                style: 'destructive',
                onPress: () => {
                  if (!auth) return;
                  signOut((seat) => leave({ ...seat })).catch((e) =>
                    Alert.alert('Could not leave the Table', e instanceof ConvexError ? String(e.data) : 'Check your connection and try again.'),
                  );
                },
              },
            ])
          }
        />
      </View>

      <GrandparentSheet visible={guestOpen} onClose={() => setGuestOpen(false)} />
      <RenameSheet key={me.tableName} visible={renameOpen} onClose={() => setRenameOpen(false)} current={me.tableName} />
      <Sheet visible={feastOpen} title="Feast time" onClose={() => setFeastOpen(false)}>
        <Txt variant="meta">When does your family slow down on Sundays? The Feast is served then.</Txt>
        {FEAST_TIMES.map((t) => (
          <Choice
            key={t.key}
            label={t.label}
            detail={t.detail}
            selected={me.feastHour === t.hour}
            onPress={() => auth && void updateTable({ ...auth, feastHour: t.hour }).then(() => setFeastOpen(false))}
          />
        ))}
      </Sheet>
    </Screen>
  );
}
