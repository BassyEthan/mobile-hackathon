import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton, Txt } from '@/components/ui';
import { Color, Radius, Space } from '@/constants/dumpling';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  return (
    <Modal visible={visible} transparent animationType={reduced ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" accessibilityRole="button" />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Space.xl) }]}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <Txt variant="title" style={{ flex: 1 }}>{title}</Txt>
            <IconButton icon="close" label="Close" filled onPress={onClose} size={18} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: Space.lg, paddingBottom: Space.sm }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: Color.scrim },
  sheet: { backgroundColor: Color.bg, paddingHorizontal: Space.gutter, paddingTop: Space.sm, borderTopLeftRadius: Radius.sheet, borderTopRightRadius: Radius.sheet, maxHeight: '90%' },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: Color.borderStrong, marginBottom: Space.sm },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Space.lg },
});
