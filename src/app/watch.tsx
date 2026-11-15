import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { Button, Loading, StateView } from '@/components/ui';
import { Color, Space } from '@/constants/dumpling';
import { useSession } from '@/lib/session';
import type { Id } from '../../convex/_generated/dataModel';

/**
 * A grandparent's text-message link. It holds their guest seat and opens straight onto the Feast. A device that already
 * has someone's seat is never signed out by tapping it.
 */
export default function Watch() {
  const { t, m } = useLocalSearchParams<{ t?: string; m?: string }>();
  const { auth, setAuth } = useSession();
  const valid = typeof t === 'string' && t.length >= 20 && typeof m === 'string';
  const mine = !!auth && auth.memberId === m;

  useEffect(() => {
    if (!valid) return;
    if (!auth) void setAuth({ token: t, memberId: m as Id<'members'> }).then(() => router.replace('/feast'));
    else if (mine) router.replace('/feast');
  }, [valid, auth, mine, setAuth, t, m]);

  if (!valid || (auth && !mine)) {
    return (
      <View style={{ flex: 1, backgroundColor: Color.bg, justifyContent: 'center', padding: Space.gutter }}>
        <StateView
          icon="feast"
          title={valid ? 'This phone already has a seat' : 'This link is not complete'}
          body={valid ? 'The link is meant for someone else’s phone. Your own Feasts are in the Feast tab.' : 'Ask whoever sent it to send it again.'}
          action={<Button label={auth ? 'Go to the Feast' : 'Open Dumpling'} onPress={() => router.replace(auth ? '/feast' : '/welcome')} />}
        />
      </View>
    );
  }
  return <View style={{ flex: 1, backgroundColor: Color.bg }}><Loading label="Opening the Feast…" /></View>;
}
