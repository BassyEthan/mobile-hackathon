import { useQuery } from 'convex/react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '../../convex/_generated/api';
import { loadToken, saveToken } from './storage';

type Session = {
  ready: boolean;
  token: string | null;
  setToken: (token: string | null) => Promise<void>;
};

const SessionContext = createContext<Session>({ ready: false, token: null, setToken: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);

  useEffect(() => {
    loadToken()
      .then(setTokenState)
      .finally(() => setReady(true));
  }, []);

  const setToken = useCallback(async (next: string | null) => {
    await saveToken(next);
    setTokenState(next);
  }, []);

  return <SessionContext.Provider value={{ ready, token, setToken }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export function useMe() {
  const { token, setToken } = useSession();
  const me = useQuery(api.tables.me, token ? { token } : 'skip');
  useEffect(() => {
    if (me === null) void setToken(null);
  }, [me, setToken]);
  return me ?? undefined;
}

function todayIn(timeZone: string, ms: number) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
  } catch {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

export function useToday(timeZone: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return timeZone ? todayIn(timeZone, now) : undefined;
}
