import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';

import { Mascot } from '@/components/mascot';
import { Button, Chip, Screen, Txt } from '@/components/ui';
import { LANGUAGES, Palette, Radius, Type } from '@/constants/dumpling';
import { useSession } from '@/lib/session';
import { api } from '../../convex/_generated/api';

type Mode = 'join' | 'create';

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'America/Los_Angeles';
  } catch {
    return 'America/Los_Angeles';
  }
}

export default function Welcome() {
  const { setToken } = useSession();
  const join = useMutation(api.tables.join);
  const create = useMutation(api.tables.create);
  const [mode, setMode] = useState<Mode>('join');
  const [code, setCode] = useState('');
  const [tableName, setTableName] = useState('');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length > 0 && (mode === 'join' ? code.trim().length === 6 : tableName.trim().length > 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === 'join'
          ? await join({ joinCode: code, displayName: name, language })
          : await create({ tableName, displayName: name, language, timeZone: deviceTimeZone() });
      await setToken(result.token);
    } catch (e) {
      setError(e instanceof ConvexError ? String(e.data) : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={styles.hero}>
          <Mascot size={130} />
          <Txt variant="hero" style={styles.center}>
            Dumpling
          </Txt>
          <Txt style={[styles.center, { color: Palette.inkSoft }]}>Your family&apos;s week, served every Sunday.</Txt>
        </View>

        <View style={styles.row}>
          <Chip label="Join a Table" selected={mode === 'join'} onPress={() => setMode('join')} />
          <Chip label="Start a Table" selected={mode === 'create'} onPress={() => setMode('create')} />
        </View>

        {mode === 'join' ? (
          <TextInput
            testID="join-code"
            value={code}
            onChangeText={(t) => setCode(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6))}
            placeholder="ABC123"
            placeholderTextColor={Palette.inkSoft}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, styles.code]}
          />
        ) : (
          <TextInput
            testID="table-name"
            value={tableName}
            onChangeText={setTableName}
            placeholder="Table name, like The Lungs"
            placeholderTextColor={Palette.inkSoft}
            style={styles.input}
          />
        )}
        <TextInput
          testID="display-name"
          value={name}
          onChangeText={setName}
          placeholder="Your name at the table"
          placeholderTextColor={Palette.inkSoft}
          style={styles.input}
        />
        <Txt variant="label">Captions in</Txt>
        <View style={styles.row}>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={l.label} selected={language === l.code} onPress={() => setLanguage(l.code)} />
          ))}
        </View>
        {error && <Txt style={{ color: Palette.danger }}>{error}</Txt>}
        <Button
          testID="welcome-submit"
          label={mode === 'join' ? 'Take my seat' : 'Set the table'}
          onPress={submit}
          disabled={!ready}
          busy={busy}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: 8, marginTop: 12 },
  center: { textAlign: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  input: {
    minHeight: 60,
    borderRadius: Radius.chip,
    backgroundColor: Palette.card,
    borderWidth: 1,
    borderColor: Palette.creamDeep,
    paddingHorizontal: 20,
    fontSize: Type.body,
    color: Palette.ink,
    fontFamily: Type.family,
  },
  code: { fontSize: 28, letterSpacing: 8, fontWeight: '800', textAlign: 'center' },
});
