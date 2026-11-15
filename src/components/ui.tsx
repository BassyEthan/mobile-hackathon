import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Color, Font, Radius, Space, Type } from '@/constants/dumpling';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useElder } from '@/lib/session';

/* ───────────────────────── Layout ───────────────────────── */

export function Screen({
  children,
  scroll = true,
  header,
  bottomInset = 0,
  dark,
  gap = Space.xl,
}: {
  children: ReactNode;
  scroll?: boolean;
  header?: ReactNode;
  bottomInset?: number;
  dark?: boolean;
  gap?: number;
}) {
  const insets = useSafeAreaInsets();
  const background = { backgroundColor: dark ? Color.night : Color.bg };
  const padding = { paddingBottom: insets.bottom + bottomInset + Space.xxl, gap };
  return (
    <View style={[styles.screen, background, { paddingTop: insets.top }]}>
      {header}
      {scroll ? (
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.content, padding, !header && { paddingTop: Space.lg }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.screen, styles.content, padding, !header && { paddingTop: Space.lg }]}>{children}</View>
      )}
    </View>
  );
}

/** A plain top bar for pushed screens: back on the left, an optional action on the right. */
export function NavBar({ title, onBack, right, dark }: { title?: string; onBack: () => void; right?: ReactNode; dark?: boolean }) {
  return (
    <View style={styles.navBar}>
      <IconButton icon="back" label="Back" onPress={onBack} tone={dark ? 'dark' : 'light'} />
      <Txt variant="headline" numberOfLines={1} style={[{ flex: 1, textAlign: 'center' }, dark && { color: Color.nightText }]}>
        {title ?? ''}
      </Txt>
      <View style={{ minWidth: 44, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

/* ───────────────────────── Type ───────────────────────── */

export type TxtVariant = keyof typeof Type | 'brand' | 'eyebrow';

export function Txt({
  children,
  variant = 'body',
  style,
  ...rest
}: {
  children: ReactNode;
  variant?: TxtVariant;
  style?: StyleProp<TextStyle>;
  testID?: string;
  numberOfLines?: number;
  selectable?: boolean;
  accessibilityRole?: 'header' | 'text';
}) {
  const elder = useElder();
  const base = variantStyle(variant);
  const scaled = elder ? { fontSize: base.fontSize * 1.22, lineHeight: base.lineHeight * 1.22 } : null;
  return (
    <Text
      maxFontSizeMultiplier={elder ? 1.6 : 2}
      style={[styles.text, base, scaled, style]}
      accessibilityRole={rest.accessibilityRole ?? (variant === 'display' || variant === 'title' ? 'header' : undefined)}
      {...rest}>
      {children}
    </Text>
  );
}

function variantStyle(variant: TxtVariant): TextStyle & { fontSize: number; lineHeight: number } {
  if (variant === 'brand') return { fontFamily: Font.brand, fontSize: 28, lineHeight: 34, fontWeight: '600' };
  if (variant === 'eyebrow') return { ...Type.meta, color: Color.brandDeep };
  const t = Type[variant];
  return { ...t, ...(variant === 'meta' || variant === 'caption' ? { color: Color.textSoft } : null) };
}

/* ───────────────────────── Controls ───────────────────────── */

type ButtonKind = 'primary' | 'secondary' | 'quiet' | 'danger' | 'onDark';

export function Button({
  label,
  onPress,
  kind = 'primary',
  size = 'md',
  icon,
  disabled,
  busy,
  testID,
  stretch = true,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  size?: 'lg' | 'md' | 'sm';
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
  stretch?: boolean;
}) {
  const reduced = useReducedMotion();
  const elder = useElder();
  const fg = kind === 'primary' || kind === 'danger' ? Color.surface : kind === 'onDark' ? Color.nightText : kind === 'quiet' ? Color.brandDeep : Color.text;
  const height = (size === 'lg' ? 56 : size === 'md' ? 50 : 40) + (elder ? 8 : 0);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      disabled={disabled || busy}
      hitSlop={size === 'sm' ? 4 : 0}
      onPress={() => {
        if (kind === 'primary') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { minHeight: height, alignSelf: stretch ? 'stretch' : 'flex-start' },
        size === 'sm' && { paddingHorizontal: Space.md, borderRadius: Radius.chip },
        kind === 'primary' && { backgroundColor: Color.brand },
        kind === 'danger' && { backgroundColor: Color.danger },
        kind === 'secondary' && styles.secondary,
        kind === 'onDark' && { backgroundColor: 'rgba(251,244,236,0.12)' },
        kind === 'quiet' && { paddingHorizontal: Space.sm },
        (disabled || busy) && { opacity: 0.45 },
        pressed && (reduced ? { opacity: 0.7 } : styles.pressed),
      ]}>
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.buttonInner}>
          {icon && <Icon name={icon} size={size === 'sm' ? 18 : 20} color={fg} />}
          <Text maxFontSizeMultiplier={1.6} style={[styles.text, size === 'sm' ? Type.callout : Type.headline, { color: fg, textAlign: 'center', flexShrink: 1 }, elder && { fontSize: 20 }]}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'light',
  filled,
  size = 22,
  testID,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'light' | 'dark';
  filled?: boolean;
  size?: number;
  testID?: string;
  disabled?: boolean;
}) {
  const color = tone === 'dark' ? Color.nightText : Color.text;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        filled && { backgroundColor: tone === 'dark' ? 'rgba(251,244,236,0.12)' : Color.surface2 },
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.6 },
      ]}>
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

/** A text link with an optional icon, for secondary actions that should not compete with the primary one. */
export function LinkButton({ label, icon, onPress, testID, tone = 'brand' }: { label: string; icon?: IconName; onPress: () => void; testID?: string; tone?: 'brand' | 'soft' | 'dark' }) {
  const color = tone === 'brand' ? Color.brandDeep : tone === 'dark' ? Color.nightText : Color.textSoft;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10} style={({ pressed }) => [styles.link, pressed && { opacity: 0.6 }]}>
      {icon && <Icon name={icon} size={17} color={color} />}
      <Text maxFontSizeMultiplier={1.6} style={[styles.text, Type.callout, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, icon, testID }: { label: string; selected?: boolean; onPress: () => void; icon?: IconName; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      hitSlop={4}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { opacity: 0.7 }]}>
      {icon && <Icon name={icon} size={16} color={selected ? Color.brandDeep : Color.textSoft} />}
      <Text maxFontSizeMultiplier={1.6} style={[styles.text, Type.callout, { color: selected ? Color.brandDeep : Color.text }]}>{label}</Text>
    </Pressable>
  );
}

/** A large answer row used in onboarding and settings: one tap, clear check, room for translated text. */
export function Choice({ label, detail, selected, onPress, multi, testID }: { label: string; detail?: string; selected: boolean; onPress: () => void; multi?: boolean; testID?: string }) {
  const elder = useElder();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={multi ? { checked: selected } : { selected }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.choice, elder && { minHeight: 72 }, selected && styles.choiceSelected, pressed && { opacity: 0.8 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="headline">{label}</Txt>
        {detail && <Txt variant="meta">{detail}</Txt>}
      </View>
      <View style={[styles.check, multi && { borderRadius: 7 }, selected && styles.checkOn]}>{selected && <Icon name="check" size={16} color={Color.surface} />}</View>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const elder = useElder();
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: Space.sm }}>
      {label && <Txt variant="meta">{label}</Txt>}
      <TextInput
        placeholderTextColor={Color.textSoft}
        maxFontSizeMultiplier={1.6}
        {...rest}
        style={[styles.field, elder && { fontSize: 20, minHeight: 60 }, rest.multiline && { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' }, style]}
      />
    </View>
  );
}

export function Toggle({ label, detail, value, onChange, testID }: { label: string; detail?: string; value: boolean; onChange: (v: boolean) => void; testID?: string }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="callout" style={{ fontWeight: '500' }}>{label}</Txt>
        {detail && <Txt variant="meta">{detail}</Txt>}
      </View>
      <Switch testID={testID} accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: Color.brand, false: Color.border }} />
    </View>
  );
}

/* ───────────────────────── Surfaces ───────────────────────── */

export function Card({ children, style, onPress, testID, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string; accessibilityLabel?: string }) {
  if (!onPress) return <View testID={testID} style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

/** A tappable list row: leading element, title and detail, trailing chevron or control. */
export function Row({
  title,
  detail,
  leading,
  trailing,
  onPress,
  testID,
  destructive,
}: {
  title: string;
  detail?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
  destructive?: boolean;
}) {
  const body = (
    <>
      {leading}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="callout" style={[{ fontWeight: '500' }, destructive && { color: Color.danger }]}>{title}</Txt>
        {detail ? <Txt variant="meta">{detail}</Txt> : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron" size={18} color={Color.textSoft} /> : null)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      {body}
    </Pressable>
  );
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: Color.border }} />;
}

export function SectionHeader({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt variant="title">{title}</Txt>
        {detail && <Txt variant="meta">{detail}</Txt>}
      </View>
      {action}
    </View>
  );
}

/** Empty, waiting and error states. Each one always says what to do next. */
export function StateView({ icon, title, body, action, dark, testID }: { icon?: IconName; title: string; body?: string; action?: ReactNode; dark?: boolean; testID?: string }) {
  return (
    <View style={styles.state} testID={testID}>
      {icon && (
        <View style={[styles.stateIcon, dark && { backgroundColor: Color.nightSurface }]}>
          <Icon name={icon} size={22} color={dark ? Color.nightSoft : Color.brandDeep} />
        </View>
      )}
      <Txt variant="headline" style={[{ textAlign: 'center' }, dark && { color: Color.nightText }]}>{title}</Txt>
      {body && <Txt variant="callout" style={{ textAlign: 'center', color: dark ? Color.nightSoft : Color.textSoft, fontWeight: '400' }}>{body}</Txt>}
      {action && <View style={{ alignSelf: 'stretch', marginTop: Space.sm }}>{action}</View>}
    </View>
  );
}

export function Loading({ label, dark }: { label?: string; dark?: boolean }) {
  return (
    <View style={[styles.state, { flex: 1 }]}>
      <ActivityIndicator color={dark ? Color.nightSoft : Color.brand} />
      {label && <Txt variant="meta" style={dark && { color: Color.nightSoft }}>{label}</Txt>}
    </View>
  );
}

/** A slim notice above the content. Used for offline, Feast ready and similar single messages. */
export function Banner({ icon, title, detail, onPress, tone = 'plain', testID, action }: { icon: IconName; title: string; detail?: string; onPress?: () => void; tone?: 'plain' | 'brand' | 'gold'; testID?: string; action?: string }) {
  const bg = tone === 'brand' ? Color.brandTint : tone === 'gold' ? Color.goldSoft : Color.surface2;
  const fg = tone === 'brand' ? Color.brandDeep : tone === 'gold' ? Color.goldDeep : Color.textSoft;
  const inner = (
    <>
      <Icon name={icon} size={20} color={fg} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="callout" style={{ fontWeight: '600' }}>{title}</Txt>
        {detail && <Txt variant="meta">{detail}</Txt>}
      </View>
      {action ? <Txt variant="callout" style={{ color: fg, fontWeight: '600' }}>{action}</Txt> : onPress ? <Icon name="chevron" size={18} color={fg} /> : null}
    </>
  );
  if (!onPress) return <View testID={testID} style={[styles.banner, { backgroundColor: bg }]}>{inner}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.banner, { backgroundColor: bg }, pressed && { opacity: 0.8 }]}>
      {inner}
    </Pressable>
  );
}

export function ProgressBar({ value, dark }: { value: number; dark?: boolean }) {
  return (
    <View style={[styles.track, dark && { backgroundColor: Color.nightLine }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Color.bg },
  content: { paddingHorizontal: Space.gutter, flexGrow: 1 },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.sm, minHeight: 52, gap: Space.sm },
  text: { color: Color.text, fontFamily: Font.ui },
  button: { borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space.lg },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.sm, flexShrink: 1 },
  secondary: { backgroundColor: Color.surface, borderWidth: 1, borderColor: Color.border },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: Radius.chip,
    backgroundColor: Color.surface,
    borderWidth: 1,
    borderColor: Color.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipSelected: { backgroundColor: Color.brandTint, borderColor: Color.brand },
  choice: {
    minHeight: 60,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.button,
    backgroundColor: Color.surface,
    borderWidth: 1,
    borderColor: Color.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  choiceSelected: { borderColor: Color.brand, backgroundColor: Color.brandTint },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: Color.borderStrong, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: Color.brand, borderColor: Color.brand },
  field: {
    minHeight: 52,
    borderRadius: Radius.chip,
    backgroundColor: Color.surface,
    borderWidth: 1,
    borderColor: Color.border,
    paddingHorizontal: Space.lg,
    fontSize: 17,
    color: Color.text,
    fontFamily: Font.ui,
  },
  card: { backgroundColor: Color.surface, borderRadius: Radius.card, borderWidth: 1, borderColor: Color.border, padding: Space.lg, gap: Space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, minHeight: 56, paddingVertical: Space.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.md },
  state: { alignItems: 'center', justifyContent: 'center', gap: Space.sm, paddingVertical: Space.xl, paddingHorizontal: Space.lg },
  stateIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Color.brandTint, alignItems: 'center', justifyContent: 'center', marginBottom: Space.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingHorizontal: Space.lg, paddingVertical: Space.md, borderRadius: Radius.tile, minHeight: 56 },
  track: { height: 4, borderRadius: 2, backgroundColor: Color.border, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: Color.brand, borderRadius: 2 },
});
