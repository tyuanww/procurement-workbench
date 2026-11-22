import { useLayoutEffect } from 'react';

const SCROLL_KEY = 'swDeskScrollY';

export type DeskScrollNavigation = 'back_forward' | 'other';

export type DeskScrollPlan = {
  readonly navigation: DeskScrollNavigation;
  readonly savedScrollY: number | null;
  readonly hasRestored: boolean;
  readonly canHold: boolean;
};

export type DeskScrollMove = {
  readonly scrollY: number | null;
  readonly mark: boolean;
};

const waitForLayout: DeskScrollMove = { scrollY: null, mark: false };
const markWithoutScroll: DeskScrollMove = { scrollY: null, mark: true };

let restoredLoad: number | null = null;

export function deskNavigation(type: string | undefined): DeskScrollNavigation {
  if (type === 'back_forward') return 'back_forward';
  return 'other';
}

export function readDeskScrollY(state: unknown): number | null {
  if (!isRecord(state)) return null;
  return finiteScroll(state[SCROLL_KEY]);
}

export function rememberDeskScroll(state: unknown, scrollY: number): Record<string, unknown> | null {
  const saved = finiteScroll(scrollY);
  if (saved === null) return null;
  const base = isRecord(state) ? state : {};
  return { ...base, [SCROLL_KEY]: saved };
}

export function isSummarySettled(summary: { readonly summary: unknown; readonly error: string }): boolean {
  return summary.summary !== null || summary.error !== '';
}

export function deskScrollPlan(input: DeskScrollPlan): DeskScrollMove {
  if (input.hasRestored) return waitForLayout;
  if (input.navigation !== 'back_forward' || input.savedScrollY === null) return markWithoutScroll;
  if (!input.canHold) return waitForLayout;
  return { scrollY: input.savedScrollY, mark: true };
}

export function useDeskScrollRestore(input: { readonly isReady: boolean; readonly layoutKey: number }): void {
  const { isReady, layoutKey } = input;
  useLayoutEffect(() => {
    const save = () => {
      const next = rememberDeskScroll(window.history.state, window.scrollY);
      if (next === null) return;
      window.history.replaceState(next, '');
    };
    window.addEventListener('pagehide', save);
    return () => window.removeEventListener('pagehide', save);
  }, []);
  useLayoutEffect(() => {
    if (!isReady || loadIsRestored()) return;
    const savedScrollY = readDeskScrollY(window.history.state);
    const plan = deskScrollPlan({
      navigation: deskNavigation(navigationType()),
      savedScrollY,
      hasRestored: false,
      canHold: pageCanHold(savedScrollY ?? 0),
    });
    if (!plan.mark) return;
    if (plan.scrollY !== null) window.scrollTo(0, plan.scrollY);
    const frame = window.requestAnimationFrame(() => markLoadRestored());
    return () => window.cancelAnimationFrame(frame);
  }, [isReady, layoutKey]);
}

function loadIsRestored(): boolean {
  return restoredLoad === performance.timeOrigin;
}

function markLoadRestored(): void {
  restoredLoad = performance.timeOrigin;
}

function pageCanHold(scrollY: number): boolean {
  const root = document.scrollingElement;
  if (root === null) return false;
  return root.scrollHeight - root.clientHeight >= scrollY;
}

function navigationType(): string | undefined {
  const entry = performance.getEntriesByType('navigation')[0];
  if (entry === undefined || !isNavigation(entry)) return undefined;
  return entry.type;
}

function isNavigation(entry: PerformanceEntry): entry is PerformanceNavigationTiming {
  return entry.entryType === 'navigation';
}

function finiteScroll(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return value;
}

function isRecord(state: unknown): state is Record<string, unknown> {
  return typeof state === 'object' && state !== null && !Array.isArray(state);
}
