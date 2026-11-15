import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'dumpling.membershipToken';

export async function loadToken() {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
  return await SecureStore.getItemAsync(KEY);
}

export async function saveToken(token: string | null) {
  if (Platform.OS === 'web') {
    if (token) globalThis.localStorage?.setItem(KEY, token);
    else globalThis.localStorage?.removeItem(KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(KEY, token);
  else await SecureStore.deleteItemAsync(KEY);
}
