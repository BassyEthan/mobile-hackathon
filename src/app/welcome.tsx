import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Mascot } from '@/components/mascot';
import { Button, Field, Txt } from '@/components/ui';
import { Color, Space } from '@/constants/dumpling';

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + Space.lg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.hero}>
        <Mascot size={96} />
        <Txt variant="brand" style={{ fontSize: 40, lineHeight: 46 }}>Dumpling</Txt>
        <Txt style={styles.tagline}>Ten seconds a day from the people you love.{'\n'}A family show every Sunday.</Txt>
      </View>
      <View style={styles.actions}>
        {joining ? (
          <>
            <Field
              testID="join-code"
              accessibilityLabel="Six character Table code"
              label="Table code from your invite"
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              autoCapitalize="characters"
              autoCorrect={false}
              autoFocus
              style={{ fontSize: 24, letterSpacing: 4, textAlign: 'center', fontWeight: '500' }}
            />
            <Button testID="join-submit" size="lg" label="Find my Table" disabled={code.length !== 6} onPress={() => router.push({ pathname: '/join/[code]', params: { code } })} />
            <Button kind="quiet" label="Back" onPress={() => setJoining(false)} />
          </>
        ) : (
          <>
            <Button testID="start-table" size="lg" label="Start a Table" onPress={() => router.push('/start')} />
            <Button testID="have-invite" kind="secondary" label="I have an invite" onPress={() => setJoining(true)} />
            <Txt variant="meta" style={{ textAlign: 'center' }}>Got a link from family? Open it and you’ll land right at their Table.</Txt>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.bg, paddingHorizontal: Space.gutter },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.md },
  tagline: { textAlign: 'center', color: Color.textSoft },
  actions: { gap: Space.sm },
});
