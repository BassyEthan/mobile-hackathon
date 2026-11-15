import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Step } from '@/components/onboarding';
import { Button, Choice, Field, Loading, StateView, Txt } from '@/components/ui';
import { Color, LANGUAGES, Space } from '@/constants/dumpling';
import { deviceLanguage } from '@/lib/intake';
import { useSession } from '@/lib/session';
import { saveValue } from '@/lib/storage';
import { api } from '../../../convex/_generated/api';

/**
 * Joining by link: the link already knows the Table, so a new member answers two questions and lands on today's spark
 * with the lid on. Everything else is asked later, one card at a time.
 */
export default function Join() {
  const { code, from } = useLocalSearchParams<{ code: string; from?: string }>();
  const { setAuth } = useSession();
  const preview = useQuery(api.tables.preview, code ? { joinCode: code, ...(from ? { invitedBy: from } : {}) } : 'skip');
  const join = useMutation(api.tables.join);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [mother, setMother] = useState(() => deviceLanguage());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/welcome'));

  if (preview === undefined) return <View style={{ flex: 1, backgroundColor: Color.bg }}><Loading label="Finding your Table…" /></View>;
  if (preview === null) {
    return (
      <View style={{ flex: 1, backgroundColor: Color.bg, justifyContent: 'center', padding: Space.gutter }}>
        <StateView
          icon="family"
          title="We couldn’t find that Table"
          body={`Check the six characters with whoever invited you. The code we tried was ${String(code ?? '').toUpperCase()}.`}
          action={<Button label="Enter a code" onPress={() => router.replace('/welcome')} />}
        />
      </View>
    );
  }

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await join({ joinCode: code, displayName: name, ...(nickname.trim() ? { nickname } : {}), language: mother, motherTongue: mother, ...(from ? { invitedBy: from } : {}) });
      // Notifications are offered after their first lid lift, not now.
      await saveValue('askNotify', true);
      await setAuth({ token: result.token, memberId: result.memberId });
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'We could not seat you. Check your connection and try again.');
      setBusy(false);
    }
  };

  if (step === 0) {
    return (
      <Step
        progress={1 / 3}
        onBack={leave}
        title={preview.inviterName ? `${preview.inviterName} saved you a seat at ${preview.tableName}` : `A seat is waiting at ${preview.tableName}`}
        detail="Everyone folds ten seconds a day. On Sunday, the Chef serves the week back as your family’s show."
        footer={<Button testID="take-seat" size="lg" label="Take my seat" onPress={() => setStep(1)} />}>
        <View style={styles.people} testID="already-here">
          <Txt variant="meta">Already at the table</Txt>
          <View style={styles.faces}>
            {preview.members.map((m, i) => (
              <View key={`${m}-${i}`} style={styles.face}>
                <Avatar name={m} size={48} />
                <Txt variant="caption" numberOfLines={1} style={{ color: Color.text }}>{m}</Txt>
              </View>
            ))}
          </View>
        </View>
      </Step>
    );
  }

  if (step === 1) {
    return (
      <Step progress={2 / 3} onBack={() => setStep(0)} title="What does your family call you?" footer={<Button testID="continue" size="lg" label="Continue" disabled={!name.trim()} onPress={() => setStep(2)} />}>
        <Field testID="display-name" label="Your name" value={name} onChangeText={setName} placeholder="Maya" autoFocus autoCapitalize="words" maxLength={40} />
        <Field label="Nickname, if they use one" value={nickname} onChangeText={setNickname} placeholder="Optional" maxLength={40} />
      </Step>
    );
  }

  return (
    <Step
      progress={1}
      onBack={() => setStep(1)}
      title="What’s your mother tongue?"
      detail="Clips from the family will be captioned in it."
      footer={
        <>
          {error && <Txt variant="meta" style={{ color: Color.danger }}>{error}</Txt>}
          <Button testID="welcome-submit" size="lg" label={`Join ${preview.tableName}`} busy={busy} onPress={() => void submit()} />
        </>
      }>
      {LANGUAGES.map((l) => <Choice key={l.code} label={l.label} detail={l.label !== l.english ? l.english : undefined} selected={mother === l.code} onPress={() => setMother(l.code)} />)}
    </Step>
  );
}

const styles = StyleSheet.create({
  people: { gap: Space.md, marginTop: Space.sm },
  faces: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.lg },
  face: { alignItems: 'center', gap: 6, width: 64 },
});
