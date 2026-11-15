import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, ProgressBar, Txt } from '@/components/ui';
import { Color, Space } from '@/constants/dumpling';

/**
 * One question per screen. Progress and back at the top; the answer in the middle; the one action at the bottom,
 * within reach of a thumb.
 */
export function Step({
  progress,
  onBack,
  title,
  detail,
  children,
  footer,
  testID,
}: {
  progress?: number;
  onBack?: () => void;
  title: string;
  detail?: string;
  children?: ReactNode;
  footer: ReactNode;
  testID?: string;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.top, { paddingTop: insets.top + Space.xs }]}>
        {onBack ? <IconButton icon="back" label="Back" onPress={onBack} /> : <View style={{ width: 44, height: 44 }} />}
        {progress !== undefined && <View style={{ flex: 1 }}><ProgressBar value={progress} /></View>}
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" testID={testID}>
        <View style={{ gap: Space.sm }}>
          <Txt variant="display" accessibilityRole="header">{title}</Txt>
          {detail && <Txt style={{ color: Color.textSoft }}>{detail}</Txt>}
        </View>
        <View style={{ gap: Space.sm }}>{children}</View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + Space.lg }]}>{footer}</View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Color.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.sm },
  body: { paddingHorizontal: Space.gutter, paddingTop: Space.xl, paddingBottom: Space.xl, gap: Space.xl, flexGrow: 1 },
  footer: { paddingHorizontal: Space.gutter, paddingTop: Space.md, gap: Space.sm, backgroundColor: Color.bg },
});
