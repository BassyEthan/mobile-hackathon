import { useQuery } from 'convex/react';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Recorder } from '@/components/recorder';
import { Color } from '@/constants/dumpling';
import { useOutbox } from '@/lib/outbox';
import { useMe, useSession, useToday } from '@/lib/session';
import { api } from '../../convex/_generated/api';

/**
 * Fold opens straight to the camera with today's spark shown small. Keeping the spark answers it; hiding it makes a free
 * Fold. After one review screen the clip goes to the outbox and the person is back on Today at once, where it shows as
 * sending.
 */
export default function Fold() {
  const params = useLocalSearchParams<{ fillingId?: string; sparkKey?: string; replyTo?: string; prompt?: string }>();
  const insets = useSafeAreaInsets();
  const { auth } = useSession();
  const me = useMe();
  const date = useToday(me?.timeZone);
  const outbox = useOutbox();
  const needsSpark = !params.prompt && !params.replyTo;
  const today = useQuery(api.today.get, needsSpark && auth && date ? { ...auth, date } : 'skip');
  const todaySpark = today?.filling?.sparks[0];
  const spark = params.prompt
    ? { text: params.prompt, fillingId: params.fillingId, key: params.sparkKey }
    : todaySpark && today?.filling
      ? { text: todaySpark.text, fillingId: today.filling.id as string, key: todaySpark.key }
      : null;
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={{ flex: 1, backgroundColor: Color.night, paddingTop: insets.top + 4, paddingBottom: insets.bottom + 8 }}>
      <StatusBar style="light" />
      <Recorder
        prompt={spark?.text ?? null}
        elder={me?.isElder}
        voiceDefault={me?.voiceOnly}
        doneLabel={params.replyTo ? 'Fold it back' : 'Fold it'}
        onClose={close}
        onDone={(take, sparkKept) => {
          void outbox.enqueue(take, {
            ...(sparkKept && spark?.fillingId ? { fillingId: spark.fillingId, sparkKey: spark.key } : {}),
            ...(params.replyTo ? { replyTo: params.replyTo } : {}),
          });
          router.dismissTo('/');
        }}
      />
    </View>
  );
}
