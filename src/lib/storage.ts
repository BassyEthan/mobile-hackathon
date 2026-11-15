import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'dumpling.membershipToken';

function fallbackFile() {
  return new File(Paths.document, 'dumpling-membership');
}

export async function loadToken() {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
  try {
    const token = await SecureStore.getItemAsync(KEY);
    if (token) return token;
  } catch {}
  const file = fallbackFile();
  return file.exists ? (await file.text()) || null : null;
}

export async function saveToken(token: string | null) {
  if (Platform.OS === 'web') {
    if (token) globalThis.localStorage?.setItem(KEY, token);
    else globalThis.localStorage?.removeItem(KEY);
    return;
  }
  const file = fallbackFile();
  try {
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
    if (file.exists) file.delete();
  } catch {
    if (token) file.write(token);
    else if (file.exists) file.delete();
  }
}
