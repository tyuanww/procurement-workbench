import { createContext, useContext, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';

type Entry = {
  readonly key: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly state: unknown;
  readonly index: number | undefined;
};
type History = { readonly current: Entry; readonly previous?: Entry; readonly focus: ReturnType<typeof focusOnArrival> };
const BrowserHistory = createContext<History | undefined>(undefined);
export const SearchDialogFocus = createContext<{ readonly isBlocking: boolean; readonly returnTarget: Element | null }>({
  isBlocking: false, returnTarget: null,
});
const modifierKeys = new Set(['Alt', 'AltGraph', 'Control', 'Meta', 'Shift']);

function focusOnArrival() {
  const inherited = typeof document === 'undefined' ? null : document.activeElement;
  let hasInteracted = false;
  return {
    recordInput(event: Event) {
      if (event instanceof KeyboardEvent && modifierKeys.has(event.key)) return;
      hasInteracted = true;
    },
    canRestore({ allowInherited = false, searchReturnTarget = null }: {
      readonly allowInherited?: boolean;
      readonly searchReturnTarget?: Element | null;
    } = {}) {
      const active = document.activeElement;
      if (hasInteracted || active === null || active.closest('[aria-modal="true"]')) return false;
      return active === document.body || active === searchReturnTarget || (allowInherited && active === inherited);
    },
  };
}

export function BrowserEntryHistory({ children }: { readonly children: ReactNode }) {
  const location = useLocation();
  const key = location.key;
  const entry: Entry = { ...location, index: browserEntryIndex(key) };
  const [history, setHistory] = useState<History>(() => ({ current: entry, focus: focusOnArrival() }));
  const lastBrowserEntry = useRef<Entry>(entry);
  const [traversal, setTraversal] = useState<{ readonly current: Entry; readonly previous: Entry }>();
  let visit = history;
  if (history.current.key !== key) {
    const previous = traversal?.current.key === key ? traversal.previous : history.current;
    visit = { current: entry, previous, focus: focusOnArrival() };
    setHistory(visit);
  }
  const commitEntry = useEffectEvent(() => {
    if (entry.index !== undefined) lastBrowserEntry.current = entry;
  });
  useLayoutEffect(() => {
    commitEntry();
  }, [key]);
  const observePop = useEffectEvent(() => {
    // The browser can leave and return before React commits the intervening route.
    const current = browserHistoryEntry();
    const previous = lastBrowserEntry.current;
    lastBrowserEntry.current = current;
    setTraversal({ current, previous });
    if (current.key === visit.current.key && current.index === visit.current.index) {
      setHistory({ current, previous, focus: focusOnArrival() });
    }
  });
  useLayoutEffect(() => {
    window.addEventListener('popstate', observePop, true);
    return () => window.removeEventListener('popstate', observePop, true);
  }, []);
  useRecordInput(visit.focus);
  return <BrowserHistory value={visit}>{children}</BrowserHistory>;
}

function useRecordInput(focus: History['focus']) {
  useLayoutEffect(() => {
    const controller = new AbortController();
    for (const event of ['keydown', 'pointerdown', 'click', 'input', 'wheel']) {
      document.addEventListener(event, focus.recordInput, { capture: true, passive: true, signal: controller.signal });
    }
    return () => controller.abort();
  }, [focus]);
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
  const entry = browserHistoryEntry();
  return entry.key === key ? entry.index : undefined;
}

function browserHistoryEntry(): Entry {
  const state = window.history.state;
  const { pathname, search, hash } = window.location;
  return { key: state?.key ?? 'default', pathname, search, hash, state: state?.usr,
    index: typeof state?.idx === 'number' ? state.idx : undefined };
}
