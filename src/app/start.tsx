import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { router } from 'expo-router';
import { useState } from 'react';

import { Step } from '@/components/onboarding';
import { Button, Choice, Field, Txt } from '@/components/ui';
import { Color, FEAST_TIMES, LANGUAGES } from '@/constants/dumpling';
import { HOST_STEPS, MISS_MOST, deviceLanguage, deviceTimeZone } from '@/lib/intake';
import { useSession } from '@/lib/session';
import { api } from '../../convex/_generated/api';

/**
 * Host onboarding. Only questions whose answers change the app: what they miss picks the Table's first spark, the mother
 * tongue sets their captions, the names identify them and their Table, and the Sunday time sets when the Feast is served.
 * Everything else can wait until it is needed.
 */
const STEPS = ['miss', 'mother', 'name', 'table', 'feast'] as const;

export default function StartTable() {
  const { setAuth, setSetup } = useSession();
  const create = useMutation(api.tables.create);
  const [step, setStep] = useState(0);
  const [missMost, setMissMost] = useState<string | null>(null);
  const [mother, setMother] = useState<string>(() => deviceLanguage());
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [tableName, setTableName] = useState('');
  const [feastHour, setFeastHour] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const id = STEPS[step];
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => (step === 0 ? (router.canGoBack() ? router.back() : router.replace('/welcome')) : setStep((s) => s - 1));
  const progress = (step + 1) / HOST_STEPS;

  const finish = async (hour: number) => {
    setBusy(true);
    setError(null);
    try {
      const result = await create({
        tableName,
        displayName: name,
        ...(nickname.trim() ? { nickname } : {}),
        language: mother,
        motherTongue: mother,
        languages: [mother],
        timeZone: deviceTimeZone(),
        feastHour: hour,
        intake: { who: [], ...(missMost ? { missMost } : {}) },
      });
      await setSetup({ missMost, languages: [mother], feastHour: hour, step: 11 });
      await setAuth({ token: result.token, memberId: result.memberId });
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'We could not set your Table. Check your connection and try again.');
      setBusy(false);
    }
  };

  // Choosing an answer only selects it. People always move on with Continue, so a tap is never a surprise.
  const continueButton = (enabled: boolean, label = 'Continue') => <Button testID="continue" size="lg" label={label} disabled={!enabled} onPress={next} />;

  switch (id) {
    case 'miss':
      return (
        <Step progress={progress} onBack={back} title="What do you miss most about your family?" detail="We’ll use it for your Table’s very first spark." footer={continueButton(!!missMost)}>
          {MISS_MOST.map((m) => <Choice key={m.key} testID={`miss-${m.key}`} label={m.label} selected={missMost === m.key} onPress={() => setMissMost(m.key)} />)}
        </Step>
      );
    case 'mother':
      return (
        <Step progress={progress} onBack={back} title="Which is your mother tongue?" detail="Your family’s clips will be captioned in it." footer={continueButton(!!mother)}>
          {LANGUAGES.map((l) => <Choice key={l.code} label={l.label} detail={l.label !== l.english ? l.english : undefined} selected={mother === l.code} onPress={() => setMother(l.code)} />)}
        </Step>
      );
    case 'name':
      return (
        <Step progress={progress} onBack={back} title="What does your family call you?" footer={continueButton(name.trim().length > 0)}>
          <Field testID="display-name" label="Your name" value={name} onChangeText={setName} placeholder="Ethan" autoFocus autoCapitalize="words" maxLength={40} returnKeyType="next" />
          <Field label="Nickname, if they use one" value={nickname} onChangeText={setNickname} placeholder="Optional" maxLength={40} />
        </Step>
      );
    case 'table':
      return (
        <Step progress={progress} onBack={back} title="Name your Table." detail="Most families use their surname, or a name only they would get." footer={continueButton(tableName.trim().length > 0)}>
          <Field testID="table-name" value={tableName} onChangeText={setTableName} placeholder="The Lungs" autoFocus autoCapitalize="words" maxLength={40} />
        </Step>
      );
    case 'feast':
      return (
        <Step
          progress={progress}
          onBack={back}
          title="When does your family slow down on Sundays?"
          detail="That’s when your Feast will be served."
          footer={
            <>
              {error && <Txt variant="meta" style={{ color: Color.danger }}>{error}</Txt>}
              <Button testID="set-table" size="lg" label="Set the table" busy={busy} disabled={feastHour === null} onPress={() => feastHour !== null && void finish(feastHour)} />
            </>
          }>
          {FEAST_TIMES.map((t) => <Choice key={t.key} testID={`feast-${t.key}`} label={t.label} detail={t.detail} selected={feastHour === t.hour} onPress={() => setFeastHour(t.hour)} />)}
        </Step>
      );
  }
}
