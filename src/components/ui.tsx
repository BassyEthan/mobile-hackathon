import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette, Radius, Type } from '@/constants/dumpling';

export function Screen({ children, scroll = true, bottomInset = 0 }: { children: ReactNode; scroll?: boolean; bottomInset?: number }) {
  const insets = useSafeAreaInsets();
  const padding = { paddingTop: insets.top + 16, paddingBottom: insets.bottom + bottomInset + 24 };
  if (!scroll) return <View style={[styles.screen, styles.content, padding]}>{children}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.content, padding]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

export function Txt({
  children,
  variant = 'body',
  style,
  ...rest
}: {
  children: ReactNode;
  variant?: 'hero' | 'title' | 'body' | 'small' | 'label';
  style?: StyleProp<TextStyle>;
  testID?: string;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  return (
    <Text style={[styles.text, styles[variant], style]} {...rest}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  big,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  busy?: boolean;
  big?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        big && styles.buttonBig,
        kind === 'primary' && styles.primary,
        kind === 'secondary' && styles.secondary,
        kind === 'quiet' && styles.quiet,
        (disabled || busy) && styles.disabled,
        pressed && styles.pressed,
      ]}>
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? Palette.cream : Palette.ink} />
      ) : (
        <Text
          style={[
            styles.text,
            big ? styles.buttonBigText : styles.buttonText,
            kind === 'primary' && { color: Palette.cream },
            kind === 'quiet' && { color: Palette.accent },
          ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.pressed]}>
      <Text style={[styles.text, styles.small, selected && { color: Palette.cream }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.cream },
  content: { paddingHorizontal: 22, gap: 18, flexGrow: 1 },
  text: { color: Palette.ink, fontFamily: Type.family },
  hero: { fontSize: Type.hero, fontWeight: '800', lineHeight: Type.hero * 1.15 },
  title: { fontSize: Type.title, fontWeight: '700', lineHeight: Type.title * 1.2 },
  body: { fontSize: Type.body, lineHeight: Type.body * 1.35 },
  small: { fontSize: Type.small, lineHeight: Type.small * 1.35, color: Palette.inkSoft },
  label: { fontSize: Type.small, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', color: Palette.accentDeep },
  card: { backgroundColor: Palette.card, borderRadius: Radius.card, padding: 22, gap: 10, borderWidth: 1, borderColor: Palette.creamDeep },
  button: { minHeight: 60, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  buttonBig: { minHeight: 96 },
  primary: { backgroundColor: Palette.accent },
  secondary: { backgroundColor: Palette.creamDeep },
  quiet: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  buttonText: { fontSize: 20, fontWeight: '700' },
  buttonBigText: { fontSize: 30, fontWeight: '800' },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: Radius.chip, backgroundColor: Palette.creamDeep, justifyContent: 'center' },
  chipSelected: { backgroundColor: Palette.ink },
});
