import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Sheet } from '@/components/sheet';
import { Button, Chip, Field, Txt } from '@/components/ui';
import { Color } from '@/constants/dumpling';
import { useSession } from '@/lib/session';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

const MAX_LENGTH = 140;

type Member = { id: Id<'members'>; displayName: string; isMe: boolean };

/**
 * One question a week, for everyone or for one person. The Chef turns it into a future spark; when it is addressed to
 * someone, they hear about it straight away.
 */
type Props = { visible: boolean; onClose: () => void; date: string; members: Member[]; to?: Id<'members'> | null };

export function AskSheet(props: Props) {
  const target = props.members.find((m) => !m.isMe && m.id === props.to);
  return (
    <Sheet visible={props.visible} title={target ? `Ask ${target.displayName}` : 'Ask the Table'} onClose={props.onClose}>
      {/* The form mounts fresh each time the sheet opens, so it always starts clean. */}
      {props.visible && <AskForm {...props} />}
    </Sheet>
  );
}

function AskForm({ onClose, date, members, to: initialTo }: Props) {
  const { auth } = useSession();
  const status = useQuery(api.asks.status, auth ? { ...auth, date } : 'skip');
  const submit = useMutation(api.asks.submit);
  const [text, setText] = useState('');
  const [to, setTo] = useState<Id<'members'> | null>(initialTo ?? null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = members.filter((m) => !m.isMe);
  const target = others.find((m) => m.id === to);

  const send = async () => {
    if (!auth) return;
    setBusy(true);
    setError(null);
    try {
      await submit({ ...auth, text, ...(to ? { addressedTo: to } : {}) });
      setText('');
      setSent(true);
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'That did not send. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {sent ? (
        <View style={{ gap: 16 }}>
          <Txt>{target ? `${target.displayName} will see your question.` : 'Your question is with the Chef.'} It may become a spark later this week.</Txt>
          <Button label="Done" onPress={onClose} />
        </View>
      ) : status?.askedThisWeek ? (
        <View style={{ gap: 16 }}>
          <Txt>You have asked your question for this week. You can ask again on Monday.</Txt>
          <Button kind="secondary" label="Close" onPress={onClose} />
        </View>
      ) : (
        <>
          <Txt variant="meta">One question a week. The Chef may use it as a spark for the family.</Txt>
          <Field
            accessibilityLabel="Your question"
            testID="ask-text"
            value={text}
            onChangeText={(t) => setText(t.slice(0, MAX_LENGTH))}
            placeholder={target ? `What would you like to ask ${target.displayName}?` : 'What do you want to hear about?'}
            maxLength={MAX_LENGTH}
            multiline
          />
          {others.length > 0 && (
            <View style={{ gap: 8 }}>
              <Txt variant="meta">Ask</Txt>
              <View style={styles.row}>
                <Chip label="Everyone" selected={to === null} onPress={() => setTo(null)} />
                {others.map((m) => (
                  <Chip key={m.id} label={m.displayName} selected={to === m.id} onPress={() => setTo(m.id)} />
                ))}
              </View>
            </View>
          )}
          {error && <Txt variant="meta" style={{ color: Color.danger }}>{error}</Txt>}
          <Button testID="ask-send" icon="send" label="Send question" busy={busy} disabled={text.trim().length < 3} onPress={() => void send()} />
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
