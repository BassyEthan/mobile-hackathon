import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { Id } from '../../convex/_generated/dataModel';

export type Membership = { token: string; memberId: Id<'members'> };

const KEY = 'dumpling.membership';

function fallbackFile() {
  return new File(Paths.document, 'dumpling-membership.json');
}

function parse(raw: string | null | undefined): Membership | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<Membership>;
    return typeof value.token === 'string' && typeof value.memberId === 'string'
      ? { token: value.token, memberId: value.memberId as Id<'members'> }
      : null;
  } catch {
    return null;
  }
}

export async function loadMembership() {
  if (Platform.OS === 'web') return parse(globalThis.localStorage?.getItem(KEY));
  try {
    const stored = parse(await SecureStore.getItemAsync(KEY));
    if (stored) return stored;
  } catch {}
  const file = fallbackFile();
  return file.exists ? parse(await file.text()) : null;
}

export async function saveMembership(membership: Membership | null) {
  const raw = membership ? JSON.stringify(membership) : null;
  if (Platform.OS === 'web') {
    if (raw) globalThis.localStorage?.setItem(KEY, raw);
    else globalThis.localStorage?.removeItem(KEY);
    return;
  }
  const file = fallbackFile();
  try {
    if (raw) await SecureStore.setItemAsync(KEY, raw);
    else await SecureStore.deleteItemAsync(KEY);
    if (file.exists) file.delete();
  } catch {
    if (raw) file.write(raw);
    else if (file.exists) file.delete();
  }
}

/** Small JSON values that are not secrets (seen markers, the host's setup progress, the upload outbox). */
function valueFile(key: string) {
  return new File(Paths.document, `dumpling-${key}.json`);
}

export async function loadValue<T>(key: string): Promise<T | null> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(`dumpling.${key}`) : valueFile(key).exists ? await valueFile(key).text() : null;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export async function saveValue(key: string, value: unknown) {
  try {
    if (Platform.OS === 'web') {
      if (value === null) globalThis.localStorage?.removeItem(`dumpling.${key}`);
      else globalThis.localStorage?.setItem(`dumpling.${key}`, JSON.stringify(value));
      return;
    }
    const file = valueFile(key);
    if (value === null) {
      if (file.exists) file.delete();
    } else file.write(JSON.stringify(value));
  } catch {
    // Storage is a convenience; the app keeps working in memory.
  }
}
