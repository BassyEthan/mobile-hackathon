import type { ComponentProps } from 'react';
import { TabList, TabSlot, TabTrigger, Tabs, type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Palette, Radius } from '@/constants/dumpling';

type TabButtonProps = Omit<TabTriggerSlotProps, 'ref'> & Pick<ComponentProps<typeof Pressable>, 'ref'>;

function TabButton({ children, isFocused, ...props }: TabButtonProps) {
  return (
    <Pressable {...props} style={[styles.button, isFocused && styles.focused]}>
      <Text style={[styles.label, isFocused && { color: Palette.cream }]}>{children}</Text>
    </Pressable>
  );
}

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <View style={styles.bar}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Today</TabButton>
          </TabTrigger>
          <TabTrigger name="feast" href="/feast" asChild>
            <TabButton>Feast</TabButton>
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'center', gap: 8, padding: 12, backgroundColor: Palette.creamDeep },
  button: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: Radius.chip },
  focused: { backgroundColor: Palette.ink },
  label: { fontSize: 16, fontWeight: '700', color: Palette.ink },
});
