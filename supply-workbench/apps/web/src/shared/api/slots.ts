import type { MeResponse, TodayResponse } from '@sw/contracts';
import type { ReadFamily } from './drops.js';

export type TodayScope = 'mine' | 'all';
type TodaySlot = TodayScope | `${TodayScope}-pending`;
type RetainedSlot = 'me' | TodaySlot;

export type ClearNotice = { readonly isSilent: boolean; readonly previous?: TodayResponse | null };

type MeListener = {
  onValue: (value: MeResponse) => void;
  onClear: (notice: ClearNotice) => void;
};

type TodayListener = {
  onValue: (value: TodayResponse) => void;
  onClear: (notice: ClearNotice) => void;
};

const RETAIN_MS = 30_000;
const generation: Record<'me' | 'lines' | 'plan', number> = { me: 0, lines: 0, plan: 0 };
const TODAY_SLOTS: readonly TodaySlot[] = ['mine', 'all', 'mine-pending', 'all-pending'];
const todayGeneration: Record<TodaySlot, number> = { mine: 0, all: 0, 'mine-pending': 0, 'all-pending': 0 };
const timers = new Map<RetainedSlot, ReturnType<typeof setTimeout>>();

export { RETAIN_MS };
const meListeners = new Set<MeListener>();
const todayListeners: Record<TodaySlot, Set<TodayListener>> = { mine: new Set(), all: new Set(), 'mine-pending': new Set(), 'all-pending': new Set() };

let me: MeResponse | null = null;
const today = new Map<TodaySlot, TodayResponse>();

export function generationOf(family: 'me' | 'lines' | 'plan'): number {
  return generation[family];
}

export function todayGenerationOf(slot: TodaySlot): number {
  return todayGeneration[slot];
}

export function peekMe(): MeResponse | null {
  return me;
}

export function peekToday(slot: TodaySlot): TodayResponse | null {
  return today.get(slot) ?? null;
}

export function sessionId(): string | null {
  return me === null ? null : me.id;
}

export function storeMe(value: MeResponse): void {
  me = value;
  arm('me');
  for (const listener of meListeners) listener.onValue(value);
}

export function storeToday(slot: TodaySlot, value: TodayResponse): void {
  today.set(slot, value);
  arm(slot);
  todayListeners[slot].forEach((listener) => listener.onValue(value));
}

export function clearFamily(family: ReadFamily, notice: ClearNotice): void {
  if (family === 'today') {
    for (const slot of TODAY_SLOTS) {
      disarm(slot);
      bumpToday(slot);
    }
  } else {
    if (family === 'me') disarm(family);
    generation[family] += 1;
  }
  if (family === 'me') clearMe(notice);
  if (family === 'today') clearToday(notice);
}

export function subscribeMe(listener: MeListener): () => void {
  meListeners.add(listener);
  return () => { meListeners.delete(listener); };
}

export function subscribeToday(scope: TodayScope, listener: TodayListener): () => void {
  const listeners = todayListeners[scope];
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emptySlots(): void {
  disarm('me');
  generation.me += 1;
  generation.lines += 1;
  generation.plan += 1;
  me = null;
  today.clear();
  meListeners.clear();
  for (const slot of TODAY_SLOTS) {
    disarm(slot);
    bumpToday(slot);
    todayListeners[slot].clear();
  }
}

function arm(slot: RetainedSlot): void {
  disarm(slot);
  timers.set(slot, setTimeout(() => { expire(slot); }, RETAIN_MS));
}

function disarm(slot: RetainedSlot): void {
  const timer = timers.get(slot);
  if (timer === undefined) return;
  clearTimeout(timer);
  timers.delete(slot);
}

function expire(slot: RetainedSlot): void {
  timers.delete(slot);
  if (slot === 'me') {
    clearFamily('me', { isSilent: false });
    return;
  }
  const previous = peekToday(slot);
  today.delete(slot);
  bumpToday(slot);
  todayListeners[slot].forEach((listener) => listener.onClear({ isSilent: false, previous }));
}

function bumpToday(slot: TodaySlot): void {
  todayGeneration[slot] += 1;
}

function clearMe(notice: ClearNotice): void {
  me = null;
  for (const listener of meListeners) listener.onClear(notice);
}

function clearToday(notice: ClearNotice): void {
  today.clear();
  for (const slot of TODAY_SLOTS) todayListeners[slot].forEach((listener) => listener.onClear(notice));
}
