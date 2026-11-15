import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Mascot } from '@/components/mascot';
import { Step } from '@/components/onboarding';
import { Button, Choice, Field, Txt } from '@/components/ui';
import { Color, FEAST_TIMES, LANGUAGES, Space } from '@/constants/dumpling';
import { DISTANCE, HOST_STEPS, LAST_TOGETHER, MISS_MOST, WHO, deviceLanguage, deviceTimeZone, reflection } from '@/lib/intake';
import { useSession } from '@/lib/session';
import { api } from '../../convex/_generated/api';

const STEPS = ['who', 'distance', 'last', 'miss', 'languages', 'mother', 'wish', 'reflect', 'name', 'table', 'feast'] as const;

/**
 * Host onboarding, questions 1 to 9. One question per screen, every answer is used later: who is coming shapes the
 * summary and notification ask, what they miss picks the first spark, languages set captions, Sunday time sets the Feast.
 */
export default function StartTable() {
  const { setAuth, setSetup } = useSession();
  const create = useMutation(api.tables.create);
  const [step, setStep] = useState(0);
  const [who, setWho] = useState<string[]>([]);
  const [distance, setDistance] = useState<string | null>(null);
  const [lastTogether, setLastTogether] = useState<string | null>(null);
  const [missMost, setMissMost] = useState<string | null>(null);
  const [languages, setLanguages] = useState<string[]>(() => [deviceLanguage()]);
  const [mother, setMother] = useState<string>(() => deviceLanguage());
  const [wish, setWish] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [tableName, setTableName] = useState('');
  const [feastHour, setFeastHour] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advancing = useRef<ReturnType<typeof setTimeout> | null>(null);

  const id = STEPS[step];
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => (step === 0 ? (router.canGoBack() ? router.back() : router.replace('/welcome')) : setStep((s) => s - 1));
  const progress = (step + 1) / HOST_STEPS;
  /** Single-choice questions move on by themselves after a beat, so the flow stays under two minutes. */
  const pick = (set: () => void) => {
    set();
    if (advancing.current) clearTimeout(advancing.current);
    advancing.current = setTimeout(next, 260);
  };
  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const finish = async (hour: number) => {
    setBusy(true);
    setError(null);
    try {
      const allLanguages = [...new Set([mother, ...languages])];
      const result = await create({
        tableName,
        displayName: name,
        ...(nickname.trim() ? { nickname } : {}),
        language: mother,
        motherTongue: mother,
        ...(wish ? { wishLanguage: wish } : {}),
        languages: allLanguages,
        timeZone: deviceTimeZone(),
        feastHour: hour,
        intake: { who, ...(distance ? { distance } : {}), ...(lastTogether ? { lastTogether } : {}), ...(missMost ? { missMost } : {}) },
      });
      await setSetup({ who, missMost, languages: allLanguages, feastHour: hour, step: 11 });
      await setAuth({ token: result.token, memberId: result.memberId });
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : 'We could not set your Table. Check your connection and try again.');
      setBusy(false);
    }
  };

  const continueButton = (enabled: boolean, label = 'Continue') => <Button testID="continue" size="lg" label={label} disabled={!enabled} onPress={next} />;

  switch (id) {
    case 'who':
      return (
        <Step progress={progress} onBack={back} title="Who is at your table?" detail="Choose everyone you’d like to bring together." footer={continueButton(who.length > 0)}>
          {WHO.map((w) => <Choice key={w.key} testID={`who-${w.key}`} multi label={w.label} selected={who.includes(w.key)} onPress={() => setWho((l) => toggle(l, w.key))} />)}
        </Step>
      );
    case 'distance':
      return (
        <Step progress={progress} onBack={back} title="How far apart are you?" footer={continueButton(!!distance)}>
          {DISTANCE.map((d) => <Choice key={d.key} label={d.label} selected={distance === d.key} onPress={() => pick(() => setDistance(d.key))} />)}
        </Step>
      );
    case 'last':
      return (
        <Step progress={progress} onBack={back} title="When were you last all in one place?" footer={continueButton(!!lastTogether)}>
          {LAST_TOGETHER.map((l) => <Choice key={l.key} label={l.label} selected={lastTogether === l.key} onPress={() => pick(() => setLastTogether(l.key))} />)}
        </Step>
      );
    case 'miss':
      return (
        <Step progress={progress} onBack={back} title="What do you miss most?" footer={continueButton(!!missMost)}>
          {MISS_MOST.map((m) => <Choice key={m.key} testID={`miss-${m.key}`} label={m.label} selected={missMost === m.key} onPress={() => pick(() => setMissMost(m.key))} />)}
        </Step>
      );
    case 'languages':
      return (
        <Step progress={progress} onBack={back} title="Which languages does your family speak?" detail="Clips are captioned in each of them." footer={continueButton(languages.length > 0)}>
          {LANGUAGES.map((l) => <Choice key={l.code} multi label={l.label} detail={l.label !== l.english ? l.english : undefined} selected={languages.includes(l.code)} onPress={() => setLanguages((s) => toggle(s, l.code))} />)}
        </Step>
      );
    case 'mother': {
      const options = [...LANGUAGES.filter((l) => languages.includes(l.code)), ...LANGUAGES.filter((l) => !languages.includes(l.code))];
      return (
        <Step progress={progress} onBack={back} title="Which is your mother tongue?" detail="Your captions will be in this language." footer={continueButton(!!mother)}>
          {options.map((l) => <Choice key={l.code} label={l.label} detail={l.label !== l.english ? l.english : undefined} selected={mother === l.code} onPress={() => pick(() => setMother(l.code))} />)}
        </Step>
      );
    }
    case 'wish':
      return (
        <Step progress={progress} onBack={back} title="Is there one you wish you spoke better?" detail="The Chef will slip in a phrase now and then." footer={continueButton(true, wish ? 'Continue' : 'Not really')}>
          {LANGUAGES.filter((l) => l.code !== mother).map((l) => (
            <Choice key={l.code} label={l.label} detail={l.label !== l.english ? l.english : undefined} selected={wish === l.code} onPress={() => setWish((w) => (w === l.code ? null : l.code))} />
          ))}
        </Step>
      );
    case 'reflect':
      return (
        <Step progress={progress} onBack={back} title={reflection({ lastTogether, missMost, distance })} footer={continueButton(true, 'Let’s change that')} testID="reflection">
          <View style={{ alignItems: 'flex-start', gap: Space.lg, marginTop: Space.md }}>
            <Mascot size={72} />
            <Txt variant="title" style={{ color: Color.brandDeep }}>Dumpling takes ten seconds a day.</Txt>
            <Txt style={{ color: Color.textSoft }}>Everyone folds a tiny moment. On Sunday, the Chef serves them back as your family’s own show.</Txt>
          </View>
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
