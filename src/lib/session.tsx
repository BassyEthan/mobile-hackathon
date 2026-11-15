import { useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { api } from '../../convex/_generated/api';
import { loadMembership, loadValue, saveMembership, saveValue, type Membership } from './storage';

/** What the host chose in onboarding, kept until the last setup step so "Your Table is set" can mirror it back. */
export type HostSetup = {
  missMost: string | null;
  languages: string[];
  feastHour: number;
  step: number;
};

type Session = {
  ready: boolean;
  auth: Membership | null;
  setAuth: (auth: Membership | null) => Promise<void>;
  /**
   * Signs this device out, then runs `action` (leave, delete) with the old seat. Every live query stops first, so
   * nothing re-runs against a seat the server has just ended. If the action fails, the seat is restored and the
   * error is rethrown.
   */
  signOut: (action?: (auth: Membership) => Promise<unknown>) => Promise<void>;
  setup: HostSetup | null;
  setSetup: (setup: HostSetup | null) => Promise<void>;
};

const SessionContext = createContext<Session>({
  ready: false,
  auth: null,
  setAuth: async () => {},
  signOut: async () => {},
  setup: null,
  setSetup: async () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [auth, setAuthState] = useState<Membership | null>(null);
  const [setup, setSetupState] = useState<HostSetup | null>(null);

  useEffect(() => {
    Promise.all([loadMembership(), loadValue<HostSetup>('setup')])
      .then(([membership, pending]) => {
        setAuthState(membership);
        setSetupState(membership ? pending : null);
      })
      .finally(() => setReady(true));
  }, []);

  const setAuth = useCallback(async (next: Membership | null) => {
    await saveMembership(next);
    if (!next) {
      await saveValue('setup', null);
      setSetupState(null);
    }
    setAuthState(next);
  }, []);

  const signOut = useCallback(
    async (action?: (auth: Membership) => Promise<unknown>) => {
      const current = auth;
      setAuthState(null);
      // Let React commit the signed-out render, so every live query has unsubscribed (and told the server so)
      // before the request that ends the seat is sent on the same connection.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (current && action) {
        try {
          await action(current);
        } catch (e) {
          setAuthState(current);
          throw e;
        }
      }
      await setAuth(null);
    },
    [auth, setAuth],
  );

  const setSetup = useCallback(async (next: HostSetup | null) => {
    await saveValue('setup', next);
    setSetupState(next);
  }, []);

  return <SessionContext.Provider value={{ ready, auth, setAuth, signOut, setup, setSetup }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export type Me = NonNullable<FunctionReturnType<typeof api.tables.me>>;

const MeContext = createContext<Me | undefined>(undefined);

/** One subscription to "who am I" for the whole app. A revoked seat signs the device out. */
export function MeProvider({ children }: { children: ReactNode }) {
  const { auth, setAuth } = useSession();
  const me = useQuery(api.tables.me, auth ?? 'skip');
  useEffect(() => {
    if (me === null) void setAuth(null);
  }, [me, setAuth]);
  return <MeContext.Provider value={me ?? undefined}>{children}</MeContext.Provider>;
}

export function useMe() {
  return useContext(MeContext);
}

export function useElder() {
  return useContext(MeContext)?.isElder ?? false;
}

export function todayIn(timeZone: string, ms: number) {
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

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string, style: 'short' | 'long' = 'short') {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: style, timeZone: 'UTC' });
}

export function dayOfMonth(date: string) {
  return Number(date.slice(8, 10));
}

export function longDate(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { month: 'long', day: 'numeric', timeZone: 'UTC' });
}
