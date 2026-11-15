import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { loadValue, saveValue } from '@/lib/storage';

type SeenState = { date: string | null; clips: number; feastId: string | null };
type Seen = SeenState & { markToday: (date: string, clips: number) => void; markFeast: (id: string) => void; loaded: boolean };

const SeenContext = createContext<Seen>({ date: null, clips: 0, feastId: null, loaded: false, markToday: () => {}, markFeast: () => {} });

/** What this device last looked at, so a small dot can say "something new" on Today or Feast. */
export function SeenProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SeenState>({ date: null, clips: 0, feastId: null });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void loadValue<SeenState>('seen').then((s) => {
      if (s) setState(s);
      setLoaded(true);
    });
  }, []);
  const write = useCallback((next: (s: SeenState) => SeenState) => {
    setState((s) => {
      const value = next(s);
      if (value.date === s.date && value.clips === s.clips && value.feastId === s.feastId) return s;
      void saveValue('seen', value);
      return value;
    });
  }, []);
  const markToday = useCallback((date: string, clips: number) => write((s) => ({ ...s, date, clips })), [write]);
  const markFeast = useCallback((feastId: string) => write((s) => ({ ...s, feastId })), [write]);
  return <SeenContext.Provider value={{ ...state, loaded, markToday, markFeast }}>{children}</SeenContext.Provider>;
}

export function useSeen() {
  return useContext(SeenContext);
}
