import { createContext, useContext, useState, type ReactNode } from 'react';
import { createPath, useLocation } from 'react-router';

type Entry = { readonly key: string; readonly address: string; readonly index: number | undefined };
const PreviousBrowserEntry = createContext<Entry | undefined>(undefined);

export function BrowserEntryHistory({ children }: { readonly children: ReactNode }) {
  const location = useLocation();
  const key = location.key;
  const entry: Entry = { key, address: createPath(location), index: browserEntryIndex(key) };
  const [history, setHistory] = useState<{ readonly current: Entry; readonly previous?: Entry }>({ current: entry });
  if (history.current.key !== key) setHistory({ current: entry, previous: history.current });
  const previous = history.current.key === key ? history.previous : history.current;
  return <PreviousBrowserEntry value={previous}>{children}</PreviousBrowserEntry>;
}

export function usePreviousBrowserEntry() {
  return useContext(PreviousBrowserEntry);
}

export function browserEntryIndex(key: string): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const state = window.history.state;
  if ((state?.key ?? 'default') !== key) return undefined;
  return typeof state?.idx === 'number' ? state.idx : undefined;
}
