import { NativeTabs } from 'expo-router/native-tabs';

import { Palette } from '@/constants/dumpling';

export default function AppTabs() {
  return (
    <NativeTabs backgroundColor={Palette.cream} indicatorColor={Palette.creamDeep} tintColor={Palette.accent} labelStyle={{ selected: { color: Palette.ink } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sun.max.fill" md="wb_sunny" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="feast">
        <NativeTabs.Trigger.Label>Feast</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="play.tv.fill" md="live_tv" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="convex-check">
        <NativeTabs.Trigger.Label>Convex</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bolt.horizontal.circle" md="sync" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
