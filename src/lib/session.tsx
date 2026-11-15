import { useQuery } from 'convex/react';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '../../convex/_generated/api';
import { loadMembership, saveMembership, type Membership } from './storage';

type Session = {
  ready: boolean;
  auth: Membership | null;
  setAuth: (auth: Membership | null) => Promise<void>;
};

const SessionContext = createContext<Session>({ ready: false, auth: null, setAuth: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [auth, setAuthState] = useState<Membership | null>(null);

  useEffect(() => {
    loadMembership()
      .then(setAuthState)
      .finally(() => setReady(true));
  }, []);

  const setAuth = useCallback(async (next: Membership | null) => {
    await saveMembership(next);
    setAuthState(next);
  }, []);

  return <SessionContext.Provider value={{ ready, auth, setAuth }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export function useMe() {
  const { auth, setAuth } = useSession();
  const me = useQuery(api.tables.me, auth ?? 'skip');
  useEffect(() => {
    if (me === null) void setAuth(null);
  }, [me, setAuth]);
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
