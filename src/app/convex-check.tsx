import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '../../convex/_generated/api';

export default function ConvexCheckScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const checks = useQuery(api.connectionCheck.recent);
  const record = useMutation(api.connectionCheck.record);
  const [status, setStatus] = useState('Not run yet');

  const runCheck = async () => {
    setStatus('Writing…');
    try {
      const id = await record({ source: Platform.OS });
      setStatus(`Mutation OK: ${id}`);
    } catch (error) {
      setStatus(`Mutation failed: ${String(error)}`);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[
        styles.container,
        { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + BottomTabInset + Spacing.four },
      ]}>
      <ThemedText type="subtitle">Convex connection check</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {process.env.EXPO_PUBLIC_CONVEX_URL}
      </ThemedText>

      <Pressable testID="run-convex-check" onPress={runCheck} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText type="smallBold">Run mutation</ThemedText>
        </ThemedView>
      </Pressable>
      <ThemedText testID="convex-check-status" type="small">
        {status}
      </ThemedText>

      <ThemedText type="smallBold">
        {checks === undefined ? 'Query loading…' : `Query OK: ${checks.length} recent checks`}
      </ThemedText>
      {checks?.map((check) => (
        <ThemedText key={check._id} type="code">
          {new Date(check._creationTime).toISOString()} · {check.source}
        </ThemedText>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  button: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.five,
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
