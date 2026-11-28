import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';

type Entry = { readonly key: string; readonly state: unknown; readonly index: number | undefined };
type History = { readonly current: Entry; readonly previous?: Entry; readonly focus: ReturnType<typeof focusOnArrival> };
const BrowserHistory = createContext<History | undefined>(undefined);

function focusOnArrival() {
  const inherited = typeof document === 'undefined' ? null : document.activeElement;
  let hasInteracted = false;
  return {
    recordInput() { hasInteracted = true; },
    canRestore({ allowInherited = false } = {}) {
      return !hasInteracted && (document.activeElement === document.body || (allowInherited && document.activeElement === inherited));
    },
  };
}

export function BrowserEntryHistory({ children }: { readonly children: ReactNode }) {
  const location = useLocation();
  const key = location.key;
  const entry: Entry = { key, state: location.state, index: browserEntryIndex(key) };
  const [history, setHistory] = useState<History>(() => ({ current: entry, focus: focusOnArrival() }));
  let visit = history;
  if (history.current.key !== key) {
    visit = { current: entry, previous: history.current, focus: focusOnArrival() };
    setHistory(visit);
  }
  const { focus } = visit;
  useEffect(() => {
    const controller = new AbortController();
    for (const event of ['keydown', 'pointerdown', 'click', 'input']) {
      document.addEventListener(event, focus.recordInput, { capture: true, signal: controller.signal });
    }
    return () => controller.abort();
  }, [focus]);
  return <BrowserHistory value={visit}>{children}</BrowserHistory>;
}

export function usePreviousBrowserEntry() {
  return useContext(BrowserHistory)?.previous;
}

const bodyHasFocus = () => document.activeElement === document.body;

export function useCanRestoreEntryFocus() {
  return useContext(BrowserHistory)?.focus.canRestore ?? bodyHasFocus;
}

export function browserEntryIndex(key: string): number | undefined {
  if (typeof window === 'undefined') return undefined;
  const state = window.history.state;
  if ((state?.key ?? 'default') !== key) return undefined;
  return typeof state?.idx === 'number' ? state.idx : undefined;
}
