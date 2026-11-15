import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { Directory, File, Paths } from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { useSession } from '@/lib/session';
import { loadValue, saveValue } from '@/lib/storage';
import { uploadToConvex } from '@/lib/upload';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

export type Take = { uri: string; mediaType: 'video' | 'audio' };
export type FoldParams = { fillingId?: string; sparkKey?: string; replyTo?: string };
export type OutboxItem = {
  id: string;
  uri: string;
  mediaType: 'video' | 'audio';
  params: FoldParams;
  createdAt: number;
  state: 'waiting' | 'sending' | 'failed';
  progress: number;
  error?: string;
};

type Outbox = {
  items: OutboxItem[];
  online: boolean;
  enqueue: (take: Take, params: FoldParams) => Promise<void>;
  retry: (id: string) => void;
  discard: (id: string) => void;
};

const OutboxContext = createContext<Outbox>({ items: [], online: true, enqueue: async () => {}, retry: () => {}, discard: () => {} });

const KEY = 'outbox';
const RETRY_MS = 20_000;

/** Errors that will never succeed with the same arguments. A spark that has passed is retried as a free Fold. */
function permanent(e: unknown) {
  return e instanceof ConvexError;
}

async function keepFile(take: Take, id: string) {
  if (Platform.OS === 'web') return take.uri;
  try {
    const dir = new Directory(Paths.document, 'outbox');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const target = new File(dir, `${id}.${take.mediaType === 'video' ? 'mov' : 'm4a'}`);
    await new File(take.uri).copy(target);
    return target.uri;
  } catch {
    return take.uri;
  }
}

function dropFile(uri: string) {
  if (Platform.OS === 'web' || !uri.includes('/outbox/')) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {}
}

/**
 * Uploads run in the background so a Fold never makes anyone wait. Clips are copied somewhere durable first; if the
 * phone is offline they wait and send when the connection returns.
 */
export function OutboxProvider({ children }: { children: ReactNode }) {
  const { auth } = useSession();
  const generateUploadUrl = useMutation(api.dumplings.generateUploadUrl);
  const fold = useMutation(api.dumplings.fold);
  const [items, setItems] = useState<OutboxItem[]>([]);
  const [online, setOnline] = useState(true);
  const loaded = useRef(false);
  const busy = useRef(false);
  const itemsRef = useRef<OutboxItem[]>([]);

  const commit = useCallback((next: OutboxItem[]) => {
    itemsRef.current = next;
    setItems(next);
    // Web clips are blob URLs that cannot outlive the tab, so they are not persisted.
    if (Platform.OS !== 'web') void saveValue(KEY, next.map((i) => ({ ...i, state: i.state === 'sending' ? 'waiting' : i.state, progress: 0 })));
  }, []);

  const update = useCallback((id: string, patch: Partial<OutboxItem>) => {
    commit(itemsRef.current.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, [commit]);

  useEffect(() => {
    void loadValue<OutboxItem[]>(KEY).then((saved) => {
      loaded.current = true;
      if (saved?.length) commit([...saved, ...itemsRef.current.filter((i) => !saved.some((s) => s.id === i.id))]);
    });
  }, [commit]);

  const pump = useCallback(async () => {
    if (busy.current || !auth || !loaded.current) return;
    const next = itemsRef.current.find((i) => i.state === 'waiting');
    if (!next) return;
    busy.current = true;
    update(next.id, { state: 'sending', progress: 0, error: undefined });
    try {
      const url = await generateUploadUrl({ ...auth });
      const storageId = (await uploadToConvex(url, next.uri, next.mediaType === 'video' ? 'video/quicktime' : 'audio/mp4', (p) => update(next.id, { progress: p }))) as Id<'_storage'>;
      const base = { ...auth, storageId, mediaType: next.mediaType };
      const withSpark = next.params.fillingId
        ? { fillingId: next.params.fillingId as Id<'fillings'>, ...(next.params.sparkKey ? { sparkKey: next.params.sparkKey } : {}) }
        : {};
      const reply = next.params.replyTo ? { replyTo: next.params.replyTo as Id<'dumplings'> } : {};
      try {
        await fold({ ...base, ...withSpark, ...reply });
      } catch (e) {
        // A spark from yesterday or a deleted parent should not lose the clip: post it as a free Fold instead.
        if (permanent(e) && (next.params.fillingId || next.params.replyTo)) await fold(base);
        else throw e;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dropFile(next.uri);
      commit(itemsRef.current.filter((i) => i.id !== next.id));
    } catch (e) {
      update(next.id, permanent(e)
        ? { state: 'failed', error: String((e as ConvexError<string>).data) }
        : { state: 'waiting', error: 'Waiting for a connection' });
    } finally {
      busy.current = false;
    }
  }, [auth, commit, fold, generateUploadUrl, update]);

  // Keep pumping while there is work: on changes, on reconnect, when the app returns, and on a slow timer.
  useEffect(() => {
    if (online) void pump();
  }, [items, online, pump]);

  useEffect(() => {
    void Network.getNetworkStateAsync().then((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false)).catch(() => {});
    const net = Network.addNetworkStateListener((s) => setOnline(s.isConnected !== false && s.isInternetReachable !== false));
    const app = AppState.addEventListener('change', (s) => s === 'active' && void pump());
    const timer = setInterval(() => void pump(), RETRY_MS);
    return () => {
      net.remove();
      app.remove();
      clearInterval(timer);
    };
  }, [pump]);

  const enqueue = useCallback(async (take: Take, params: FoldParams) => {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const uri = await keepFile(take, id);
    commit([...itemsRef.current, { id, uri, mediaType: take.mediaType, params, createdAt: Date.now(), state: 'waiting', progress: 0 }]);
  }, [commit]);

  const retry = useCallback((id: string) => update(id, { state: 'waiting', error: undefined }), [update]);
  const discard = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (item) dropFile(item.uri);
    commit(itemsRef.current.filter((i) => i.id !== id));
  }, [commit]);

  return <OutboxContext.Provider value={{ items, online, enqueue, retry, discard }}>{children}</OutboxContext.Provider>;
}

export function useOutbox() {
  return useContext(OutboxContext);
}
