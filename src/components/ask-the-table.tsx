import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Chip, Txt } from '@/components/ui';
import { Palette, Radius, Type } from '@/constants/dumpling';
import { useSession } from '@/lib/session';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const MAX_LENGTH = 140;

type Member = { id: Id<'members'>; displayName: string; isMe: boolean };

export function AskTheTable({ date, members }: { date: string; members: Member[] }) {
  const { auth } = useSession();
  const status = useQuery(api.asks.status, auth ? { ...auth, date } : 'skip');
  const submit = useMutation(api.asks.submit);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [to, setTo] = useState<Id<'members'> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!auth || !status) return null;
  if (status.askedThisWeek) {
    return <Txt variant="small" testID="ask-sent">Your question is with the Chef this week.</Txt>;
  }
  if (!open) {
    return <Button testID="ask-the-table" kind="secondary" label="Ask the Table" onPress={() => setOpen(true)} />;
  }

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await submit({ ...auth, text, ...(to ? { addressedTo: to } : {}) });
      setOpen(false);
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'That did not send. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const others = members.filter((m) => !m.isMe);
  return (
    <Card>
      <Txt variant="label">Ask the Table</Txt>
      <TextInput
        testID="ask-text"
        value={text}
        onChangeText={(t) => setText(t.slice(0, MAX_LENGTH))}
        placeholder="What do you want to hear about?"
        placeholderTextColor={Palette.inkSoft}
        maxLength={MAX_LENGTH}
        multiline
        style={styles.input}
      />
      {others.length > 0 && (
        <View style={styles.row}>
          <Chip label="Everyone" selected={to === null} onPress={() => setTo(null)} />
          {others.map((m) => (
            <Chip key={m.id} label={m.displayName} selected={to === m.id} onPress={() => setTo(m.id)} />
          ))}
        </View>
      )}
      {error && <Txt style={{ color: Palette.danger }}>{error}</Txt>}
      <Button testID="ask-send" label="Send" busy={busy} disabled={text.trim().length < 3} onPress={() => void send()} />
    </Card>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 80,
    borderRadius: Radius.chip,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.creamDeep,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: Type.body,
    color: Palette.ink,
    fontFamily: Type.family,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
