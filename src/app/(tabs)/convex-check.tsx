import { useAction, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import type { FunctionReturnType } from 'convex/server';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSession } from '@/lib/session';
import { api } from '../../../convex/_generated/api';

export default function ConvexCheckScreen() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const checks = useQuery(api.connectionCheck.recent);
  const record = useMutation(api.connectionCheck.record);
  const [status, setStatus] = useState('Not run yet');
  const { auth } = useSession();
  const generateNow = useAction(api.sparks.generateNow);
  const [sparkStatus, setSparkStatus] = useState('Not run yet');
  const [spark, setSpark] = useState<FunctionReturnType<typeof api.sparks.generateNow> | null>(null);

  const runGenerate = async () => {
    if (!auth) return;
    setSparkStatus('Generating tomorrow’s spark…');
    setSpark(null);
    try {
      const result = await generateNow(auth);
      setSpark(result);
      const via = result.source === 'ai' ? `AI after ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}` : (result.source ?? 'none');
      setSparkStatus(result.hiddenFromYou ? `Saved for ${result.date}, hidden from you` : `${result.status} for ${result.date} via ${via}`);
    } catch (error) {
      setSparkStatus(error instanceof ConvexError ? String(error.data) : 'Generate failed. Try again.');
    }
  };

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

      <ThemedText type="subtitle">Spark lab</ThemedText>
      <Pressable testID="generate-spark" onPress={runGenerate} disabled={!auth} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.button}>
          <ThemedText type="smallBold">Generate now</ThemedText>
        </ThemedView>
      </Pressable>
      <ThemedText testID="generate-spark-status" type="small">
        {sparkStatus}
      </ThemedText>
      {spark?.spark && (
        <ThemedView style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold">{spark.spark.type} · {spark.spark.text}</ThemedText>
          {Object.entries(spark.spark.translations).map(([language, text]) => (
            <ThemedText key={language} type="small">{language} · {text}</ThemedText>
          ))}
          {spark.spark.moreSparks.map((more) => (
            <ThemedText key={more.text} type="small">{more.type} · {more.text}</ThemedText>
          ))}
          {spark.spark.reason && <ThemedText type="small" themeColor="textSecondary">{spark.spark.reason}</ThemedText>}
          {spark.rejected.map((reason) => (
            <ThemedText key={reason} type="small" themeColor="textSecondary">Rejected: {reason}</ThemedText>
          ))}
        </ThemedView>
      )}

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
