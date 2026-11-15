import * as Linking from 'expo-linking';
import { Platform, Share } from 'react-native';

/** A link that opens Dumpling already inside the Table, showing who invited them. */
export function inviteLink(joinCode: string, from: string) {
  return Linking.createURL(`/join/${joinCode}`, { queryParams: { from } });
}

export function inviteMessage(tableName: string, joinCode: string, from: string) {
  return `Come sit at ${tableName} on Dumpling. Ten seconds a day, a family show every Sunday.\n${inviteLink(joinCode, from)}\n(Table code ${joinCode})`;
}

/** Opens the system share sheet. Resolves true when something was shared. */
export async function shareInvite(tableName: string, joinCode: string, from: string) {
  const message = inviteMessage(tableName, joinCode, from);
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ text: message });
        return true;
      }
      await navigator.clipboard?.writeText(message);
      return true;
    }
    const result = await Share.share({ message });
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}

/** A guest seat for someone who will not install the app: their link signs them straight into the Feast. */
export function guestLink(token: string, memberId: string) {
  return Linking.createURL('/watch', { queryParams: { t: token, m: memberId } });
}
