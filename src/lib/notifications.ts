import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router, type Href } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

/**
 * Asked for only after someone has felt the benefit (their first lid lift, or the end of host setup).
 * Returns the Expo push token, or null when the person declined or the build cannot receive pushes.
 */
export async function enableNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!status.granted) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', { name: 'Family moments', importance: AndroidImportance.DEFAULT });
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data;
  } catch {
    return null;
  }
}

/** Every notification carries the exact screen it mentions; opening it goes straight there. */
export function useNotificationRouting(enabled: boolean) {
  useEffect(() => {
    if (!enabled || Platform.OS === 'web') return;
    const open = (notification: Notifications.Notification) => {
      const url = notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as Href);
    };
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) {
      open(last.notification);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((response) => open(response.notification));
    return () => sub.remove();
  }, [enabled]);
}
