import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './icon';
import { Txt } from './ui';
import { Palette } from '@/constants/dumpling';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
export function Sheet({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets(); const reduced = useReducedMotion();
  return <Modal visible={visible} transparent animationType={reduced ? 'none' : 'slide'} onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Dismiss" accessibilityRole="button" />
      <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24), maxHeight: '90%' }]}>
        <View style={styles.header}><Txt variant="title" style={{ flex: 1 }}>{title}</Txt><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={styles.close}><Icon name="close" /></Pressable></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 20 }}>{children}</ScrollView>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(29,25,22,0.45)' }, sheet: { backgroundColor: Palette.cream, padding: 24, borderTopLeftRadius: 12, borderTopRightRadius: 12 }, header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });
