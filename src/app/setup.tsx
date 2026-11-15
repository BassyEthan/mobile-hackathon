import { useMutation, useQuery } from 'convex/react';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Step } from '@/components/onboarding';
import { Recorder } from '@/components/recorder';
import { Button, Loading, ProgressBar, Txt } from '@/components/ui';
import { Color, Radius, Space, feastTimeLabel, languageLabel } from '@/constants/dumpling';
import { FIRST_SPARK, HOST_STEPS, SETUP_FIRST_STEP, START_STEPS } from '@/lib/intake';
import { shareInvite } from '@/lib/invite';
import { enableNotifications } from '@/lib/notifications';
import { useOutbox } from '@/lib/outbox';
import { useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../convex/_generated/api';

function SummaryLine({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineIcon}><Icon name={icon} size={18} color={Color.brandDeep} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="meta">{label}</Txt>
        <Txt variant="callout" style={{ fontWeight: '500' }}>{value}</Txt>
      </View>
    </View>
  );
}

/**
 * Host onboarding, the last four steps, after the Table exists: the tailored summary, the very first Fold (camera access is
 * asked for here, at the moment of use), the invite, and last of all notifications, phrased as a benefit.
 */
export default function Setup() {
  const { auth, setup, setSetup } = useSession();
  const me = useMe();
  const insets = useSafeAreaInsets();
  const date = useToday(me?.timeZone);
  const day = useQuery(api.today.get, auth && date ? { ...auth, date } : 'skip');
  const savePushToken = useMutation(api.tables.savePushToken);
  const outbox = useOutbox();
  const [invited, setInvited] = useState(false);

  if (!setup || !me) return <View style={{ flex: 1, backgroundColor: Color.bg }}><Loading /></View>;

  const go = (step: number) => void setSetup({ ...setup, step });
  const done = () => void setSetup(null);
  const progress = (START_STEPS + (setup.step - SETUP_FIRST_STEP) + 1) / HOST_STEPS;
  const spark = day?.filling?.sparks[0]?.text ?? FIRST_SPARK[setup.missMost ?? ''] ?? 'Show us what’s outside your window.';

  if (setup.step <= 11) {
    return (
      <Step progress={progress} title="Your Table is set." detail={`${me.tableName}, ready for its first Dumpling.`} footer={<Button testID="continue" size="lg" label="Fold the first Dumpling" icon="video" onPress={() => go(12)} />}>
        <View style={styles.summary} testID="table-summary">
          <SummaryLine icon="language" label="Captions in" value={setup.languages.map(languageLabel).join(', ')} />
          <SummaryLine icon="spark" label="Your first spark" value={spark} />
          <SummaryLine icon="feast" label="Your Feast" value={`Sundays at ${feastTimeLabel(setup.feastHour)}`} />
        </View>
      </Step>
    );
  }

  if (setup.step === 12) {
    return (
      <View style={{ flex: 1, backgroundColor: Color.night, paddingTop: insets.top + Space.xs, paddingBottom: insets.bottom + Space.sm, gap: Space.sm }}>
        <StatusBar style="light" />
        <View style={{ paddingHorizontal: Space.gutter + 44 }}><ProgressBar value={progress} dark /></View>
        <Recorder
          prompt={spark}
          onClose={() => go(11)}
          onDone={(take, sparkKept) => {
            void outbox.enqueue(take, sparkKept && day?.filling ? { fillingId: day.filling.id, sparkKey: 'primary' } : {});
            go(13);
          }}
        />
        <Button kind="quiet" size="sm" label="I’ll fold later" onPress={() => go(13)} />
      </View>
    );
  }

  if (setup.step === 13) {
    return (
      <Step
        progress={progress}
        onBack={() => go(12)}
        title="Now, bring them to the table."
        detail="Send one link to your family chat. It opens Dumpling straight into your Table."
        footer={
          <>
            <Button
              testID="share-invite"
              size="lg"
              icon="send"
              label={invited ? 'Share again' : 'Send the invite'}
              onPress={async () => {
                const shared = await shareInvite(me.tableName, me.joinCode, me.memberId);
                if (shared) {
                  setInvited(true);
                  go(14);
                }
              }}
            />
            <Button testID="invite-later" kind="quiet" size="sm" label="I’ll do it later" onPress={() => go(14)} />
          </>
        }>
        <View style={styles.summary}>
          <Txt variant="meta">Table code, for anyone joining without the link</Txt>
          <Txt variant="display" selectable style={{ letterSpacing: 2 }}>{me.joinCode}</Txt>
        </View>
      </Step>
    );
  }

  return (
    <Step
      progress={1}
      title="Want to know when your family folds?"
      detail="We’ll tell you when someone shares, when they ask you something and when the Feast is served. Never more than two a day."
      footer={
        <>
          <Button
            testID="notify-yes"
            size="lg"
            icon="bell"
            label="Yes, tell me"
            onPress={async () => {
              const token = await enableNotifications();
              if (token && auth) await savePushToken({ ...auth, pushToken: token });
              done();
            }}
          />
          <Button testID="notify-later" kind="quiet" size="sm" label="Not now" onPress={done} />
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  summary: { backgroundColor: Color.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Color.border, padding: Space.lg, gap: Space.lg },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  lineIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: Color.brandTint, alignItems: 'center', justifyContent: 'center' },
});
