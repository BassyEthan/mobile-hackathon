import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import {
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
import { DumplingLoader } from '@/components/loader';
import { Mascot } from '@/components/mascot';
import { Color, Font, Radius, ROUNDED_VARIANTS, SERIF_VARIANTS, Space, Stroke, Type } from '@/constants/dumpling';
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
  if (variant === 'brand') return { fontFamily: Font.display, fontSize: 30, lineHeight: 36, fontWeight: '800', letterSpacing: -0.3 };
  if (variant === 'eyebrow') return { ...Type.caption, fontFamily: Font.display, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', color: Color.brandDeep };
  const t = Type[variant];
  const serif = (SERIF_VARIANTS as readonly string[]).includes(variant);
  const rounded = (ROUNDED_VARIANTS as readonly string[]).includes(variant);
  return {
    ...t,
    ...(serif ? { fontFamily: Font.display, fontWeight: '800', letterSpacing: -0.2 } : rounded ? { fontFamily: Font.brand, fontWeight: '700' } : null),
    ...(variant === 'meta' || variant === 'caption' ? { color: Color.textSoft } : null),
  };
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
  const fg = kind === 'primary' || kind === 'danger' ? Color.surface : kind === 'onDark' ? Color.nightText : kind === 'quiet' ? Color.brandDeep : Color.ink;
  const height = (size === 'lg' ? 62 : size === 'md' ? 54 : 42) + (elder ? 8 : 0);
  const chunky = kind === 'primary' || kind === 'secondary' || kind === 'danger';
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
        chunky && styles.chunky,
        kind === 'primary' && { backgroundColor: Color.brand },
        kind === 'danger' && { backgroundColor: Color.danger },
        kind === 'secondary' && { backgroundColor: Color.surface },
        kind === 'onDark' && { backgroundColor: 'rgba(255,246,230,0.14)', borderWidth: Stroke.line, borderColor: 'rgba(255,246,230,0.35)' },
        kind === 'quiet' && { paddingHorizontal: Space.sm },
        disabled && !busy && { opacity: 0.45 },
        pressed && (reduced ? { opacity: 0.7 } : chunky ? styles.chunkyPressed : styles.pressed),
      ]}>
      {busy ? (
        <DumplingLoader compact size={size === 'sm' ? 24 : 30} label={`${label}, working`} />
      ) : (
        <View style={styles.buttonInner}>
          {icon && <Icon name={icon} size={size === 'sm' ? 18 : 20} color={fg} />}
          <Text maxFontSizeMultiplier={1.6} style={[styles.text, size === 'sm' ? Type.callout : Type.headline, styles.buttonLabel, { color: fg }, elder && { fontSize: 20 }]}>
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
  const color = tone === 'dark' ? Color.nightText : Color.ink;
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
        filled && (tone === 'dark' ? { backgroundColor: 'rgba(255,246,230,0.14)' } : styles.iconFilled),
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
      <Text maxFontSizeMultiplier={1.6} style={[styles.text, Type.callout, { color, fontFamily: Font.brand, fontWeight: '700' }]}>{label}</Text>
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
      {icon && <Icon name={icon} size={16} color={Color.ink} />}
      <Text maxFontSizeMultiplier={1.6} style={[styles.text, Type.callout, { fontFamily: Font.brand, fontWeight: '700', color: Color.ink }]}>{label}</Text>
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
      <View style={[styles.check, multi && { borderRadius: 8 }, selected && styles.checkOn]}>{selected && <Icon name="check" size={16} color={Color.ink} />}</View>
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
      <Switch testID={testID} accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: Color.mint, false: Color.border }} />
    </View>
  );
}

/* ───────────────────────── Surfaces ───────────────────────── */

export function Card({ children, style, onPress, testID, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; testID?: string; accessibilityLabel?: string }) {
  if (!onPress) return <View testID={testID} style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && styles.chunkyPressed]}>
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
      {trailing ?? (onPress ? <Icon name="chevron" size={20} color={Color.ink} /> : null)}
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
export function StateView({ icon, mascot, title, body, action, dark, testID }: { icon?: IconName; mascot?: 'smile' | 'wow'; title: string; body?: string; action?: ReactNode; dark?: boolean; testID?: string }) {
  return (
    <View style={styles.state} testID={testID}>
      {mascot && <Mascot size={88} mood={mascot} steaming={mascot === 'smile'} />}
      {icon && !mascot && (
        <View style={[styles.stateIcon, dark && { backgroundColor: Color.nightSurface }]}>
          <Icon name={icon} size={28} color={dark ? Color.nightText : Color.ink} />
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
      <DumplingLoader size={72} dark={dark} label={label} />
      {label && <Txt variant="meta" style={dark && { color: Color.nightSoft }}>{label}</Txt>}
    </View>
  );
}

/** A slim notice above the content. Used for offline, Feast ready and similar single messages. */
export function Banner({ icon, leading, title, detail, onPress, tone = 'plain', testID, action }: { icon: IconName; leading?: ReactNode; title: string; detail?: string; onPress?: () => void; tone?: 'plain' | 'brand' | 'gold'; testID?: string; action?: string }) {
  const bg = tone === 'brand' ? Color.brandTint : tone === 'gold' ? Color.goldSoft : Color.skySoft;
  const fg = Color.ink;
  const inner = (
    <>
      {leading ?? <View style={styles.bannerIcon}><Icon name={icon} size={20} color={fg} /></View>}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="headline" style={{ fontSize: 16, lineHeight: 21 }}>{title}</Txt>
        {detail && <Txt variant="meta" style={{ color: Color.ink, opacity: 0.75 }}>{detail}</Txt>}
      </View>
      {action ? <View style={styles.bannerAction}><Txt variant="callout" style={{ color: Color.surface, fontFamily: Font.brand, fontWeight: '700' }}>{action}</Txt></View> : onPress ? <Icon name="chevron" size={18} color={fg} /> : null}
    </>
  );
  if (!onPress) return <View testID={testID} style={[styles.banner, { backgroundColor: bg }]}>{inner}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.banner, { backgroundColor: bg }, pressed && styles.chunkyPressed]}>
      {inner}
    </Pressable>
  );
}

export function ProgressBar({ value, dark }: { value: number; dark?: boolean }) {
  return (
    <View style={[styles.track, dark && { backgroundColor: Color.nightLine, borderColor: 'transparent' }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(value * 100) }}>
      <View style={[styles.fill, { width: `${Math.max(0, Math.min(1, value)) * 100}%` }]} />
    </View>
  );
}

const chunk = { borderWidth: Stroke.line, borderBottomWidth: Stroke.lip, borderColor: Color.ink } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Color.bg },
  content: { paddingHorizontal: Space.gutter, flexGrow: 1 },
  navBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Space.sm, minHeight: 56, gap: Space.sm },
  text: { color: Color.text, fontFamily: Font.ui },
  button: { borderRadius: Radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Space.lg },
  buttonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Space.sm, flexShrink: 1 },
  buttonLabel: { fontFamily: Font.brand, fontWeight: '700', textAlign: 'center', flexShrink: 1, letterSpacing: 0.2 },
  chunky: { ...chunk },
  chunkyPressed: { borderBottomWidth: Stroke.line, transform: [{ translateY: Stroke.lip - Stroke.line }] },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  iconFilled: { backgroundColor: Color.surface, borderWidth: Stroke.line, borderColor: Color.ink },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  chip: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
    backgroundColor: Color.surface,
    borderWidth: 1.5,
    borderColor: Color.ink,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipSelected: { backgroundColor: Color.sun },
  choice: {
    minHeight: 64,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.button,
    backgroundColor: Color.surface,
    ...chunk,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
  choiceSelected: { backgroundColor: Color.goldSoft },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: Stroke.line, borderColor: Color.ink, alignItems: 'center', justifyContent: 'center', backgroundColor: Color.surface },
  checkOn: { backgroundColor: Color.mint },
  field: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: Color.surface,
    borderWidth: Stroke.line,
    borderColor: Color.ink,
    paddingHorizontal: Space.lg,
    fontSize: 17,
    fontWeight: '600',
    color: Color.text,
    fontFamily: Font.ui,
  },
  card: { backgroundColor: Color.surface, borderRadius: Radius.card, ...chunk, padding: Space.lg, gap: Space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.md, minHeight: 60, paddingVertical: Space.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.md },
  state: { alignItems: 'center', justifyContent: 'center', gap: Space.sm, paddingVertical: Space.xl, paddingHorizontal: Space.lg },
  stateIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: Color.goldSoft, ...chunk, alignItems: 'center', justifyContent: 'center', marginBottom: Space.xs },
  banner: { flexDirection: 'row', alignItems: 'center', gap: Space.md, paddingHorizontal: Space.md, paddingVertical: Space.md, borderRadius: Radius.tile, minHeight: 64, ...chunk },
  bannerIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: Color.surface, borderWidth: 1.5, borderColor: Color.ink, alignItems: 'center', justifyContent: 'center' },
  bannerAction: { backgroundColor: Color.ink, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 7 },
  track: { height: 10, borderRadius: 5, backgroundColor: Color.surface, borderWidth: 1.5, borderColor: Color.ink, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: Color.mint, borderRadius: 4 },
});
