import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Mascot } from '@/components/mascot';
import { Button, Field, Txt } from '@/components/ui';
import { Color, Font, Space } from '@/constants/dumpling';

/** Family seats around the steamer, like places set around a table. */
const SEATS = [
  { name: 'Nai Nai', x: 6, y: 34 },
  { name: 'Mom', x: 196, y: 30 },
  { name: 'Leo', x: -6, y: 146 },
  { name: 'Ama', x: 206, y: 146 },
  { name: 'Uncle Raj', x: 100, y: 214 },
];

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const [joining, setJoining] = useState(false);
  const [code, setCode] = useState('');
  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + Space.lg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.hero}>
        <View style={styles.table} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.plate}>
            <Mascot size={112} />
          </View>
          {SEATS.map((seat) => (
            <View key={seat.name} style={[styles.seat, { left: seat.x, top: seat.y }]}>
              <Avatar name={seat.name} size={44} ring />
            </View>
          ))}
        </View>
        <Txt variant="brand" style={styles.wordmark}>Dumpling</Txt>
        <Txt style={styles.lede}>Gather the family, even from far away.</Txt>
        <Txt style={styles.tagline}>Ten seconds a day from the people you love, served as a family show every Sunday.</Txt>
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
  table: { width: 244, height: 252, marginBottom: Space.sm },
  plate: { position: 'absolute', left: 37, top: 37, width: 170, height: 170, borderRadius: 85, backgroundColor: Color.goldSoft, borderWidth: 2, borderBottomWidth: 5, borderColor: Color.ink, alignItems: 'center', justifyContent: 'center', paddingTop: 8 },
  seat: { position: 'absolute' },
  wordmark: { fontSize: 50, lineHeight: 58, color: Color.brand, letterSpacing: -0.8 },
  lede: { textAlign: 'center', fontFamily: Font.italic, fontStyle: 'italic', fontWeight: '700', fontSize: 20, lineHeight: 27, color: Color.ink },
  tagline: { textAlign: 'center', color: Color.textSoft, fontSize: 16, lineHeight: 23, maxWidth: 320 },
  actions: { gap: Space.sm },
});
