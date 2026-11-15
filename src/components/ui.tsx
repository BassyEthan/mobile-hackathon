import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { Icon, type IconName } from '@/components/icon';
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
  icon,
}: {
  icon?: IconName;
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  busy?: boolean;
  big?: boolean;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        big && styles.buttonBig,
        kind === 'primary' && styles.primary,
        kind === 'secondary' && styles.secondary,
        kind === 'quiet' && styles.quiet,
        (disabled || busy) && styles.disabled,
        pressed && (reduced ? { opacity: 0.75 } : styles.pressed),
      ]}>
      {busy ? (
        <ActivityIndicator color={Palette.ink} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 1 }}>
        {icon && <Icon name={icon} color={kind === 'quiet' ? Palette.accentDeep : Palette.ink} />}
        <Text
          style={[
            styles.text,
            big ? styles.buttonBigText : styles.buttonText,
            kind === 'primary' && { color: Palette.ink },
            kind === 'quiet' && { color: Palette.accentDeep },
          ]}>
          {label}
        </Text>
        </View>
      )}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const reduced = useReducedMotion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && (reduced ? { opacity: 0.75 } : styles.pressed)]}>
      <Text style={[styles.text, styles.small, selected && { color: Palette.cream }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Palette.cream },
  content: { paddingHorizontal: 22, gap: 24, flexGrow: 1 },
  text: { color: Palette.ink, fontFamily: Type.family },
  hero: { fontSize: Type.hero, fontWeight: '600', lineHeight: Type.hero * 1.15 },
  title: { fontSize: Type.title, fontWeight: '600', lineHeight: Type.title * 1.2 },
  body: { fontSize: Type.body, lineHeight: Type.body * 1.35 },
  small: { fontSize: Type.small, lineHeight: Type.small * 1.35, color: Palette.inkSoft },
  label: { fontSize: Type.small, fontWeight: '600', letterSpacing: 0.2, color: Palette.accentDeep },
  card: { backgroundColor: Palette.card, borderRadius: Radius.card, padding: 20, gap: 10, borderWidth: 1, borderColor: Palette.border },
  button: { minHeight: 52, borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  buttonBig: { minHeight: 60 },
  primary: { backgroundColor: Palette.accent },
  secondary: { backgroundColor: Palette.creamDeep },
  quiet: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  buttonText: { flexShrink: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  buttonBigText: { flexShrink: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: Radius.chip, backgroundColor: Palette.creamDeep, justifyContent: 'center' },
  chipSelected: { backgroundColor: Palette.ink },
});
