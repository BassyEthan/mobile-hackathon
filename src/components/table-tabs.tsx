import type { ComponentProps } from 'react';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from './icon';
import { Palette } from '@/constants/dumpling';
type Props = Omit<TabTriggerSlotProps, 'ref'> & Pick<ComponentProps<typeof Pressable>, 'ref'> & { icon: IconName };
function TabButton({ children, isFocused, icon, ...props }: Props) {
  return <Pressable {...props} accessibilityRole="tab" accessibilityState={{ selected: isFocused }} style={styles.button}>
    <View style={[styles.icon, isFocused && styles.active]}><Icon name={icon} color={isFocused ? Palette.accentDeep : Palette.inkSoft} /></View>
    <Text style={[styles.label, isFocused && { color: Palette.accentDeep }]}>{children}</Text>
  </Pressable>;
}
export default function AppTabs() {
  const insets = useSafeAreaInsets();
  return <Tabs style={{ flex: 1 }}><TabSlot style={{ flex: 1 }} /><TabList asChild><View style={StyleSheet.flatten([styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }])}>
    <TabTrigger name="index" href="/" asChild><TabButton icon="sun">Today</TabButton></TabTrigger>
    <TabTrigger name="feast" href="/feast" asChild><TabButton icon="feast">Feast</TabButton></TabTrigger>
  </View></TabList></Tabs>;
}
const styles = StyleSheet.create({ bar: { flexDirection: 'row', paddingTop: 8, borderTopWidth: 1, borderColor: Palette.border, backgroundColor: Palette.cream }, button: { flex: 1, minHeight: 52, alignItems: 'center', gap: 2 }, icon: { paddingHorizontal: 18, paddingVertical: 4, borderRadius: 12 }, active: { backgroundColor: 'transparent' }, label: { fontSize: 12, fontWeight: '600', color: Palette.inkSoft } });
