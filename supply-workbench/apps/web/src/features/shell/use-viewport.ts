import { useSyncExternalStore } from 'react';
import { viewportSnapshot, type ViewportSnapshot } from './model/chrome.js';

export const shellQuery: {
  readonly max340: '(max-width: 340px)';
  readonly max1279: '(max-width: 1279px)';
  readonly atLeast768: '(min-width: 768px)';
  readonly min1440: '(min-width: 1440px)';
} = {
  max340: '(max-width: 340px)',
  max1279: '(max-width: 1279px)',
  atLeast768: '(min-width: 768px)',
  min1440: '(min-width: 1440px)',
};

export const unknownViewport: ViewportSnapshot = { band: 'wide', contentInset: 16, isNarrow: false };

let remembered = unknownViewport;

export function readViewport(host: unknown): ViewportSnapshot {
  const next = measured(host);
  if (next.band === remembered.band && next.contentInset === remembered.contentInset && next.isNarrow === remembered.isNarrow) return remembered;
  remembered = next;
  return remembered;
}

function measured(host: unknown): ViewportSnapshot {
  if (!isRecord(host) || typeof host.matchMedia !== 'function') return unknownViewport;
  const isMax340 = ask(host, shellQuery.max340);
  const isMax1279 = ask(host, shellQuery.max1279);
  const isAtLeast768 = ask(host, shellQuery.atLeast768);
  const isMin1440 = ask(host, shellQuery.min1440);
  if (isMax340 === null || isMax1279 === null || isAtLeast768 === null || isMin1440 === null) return unknownViewport;
  return viewportSnapshot({ isMax340, isMax1279, isAtLeast768, isMin1440 });
}

export function useShellViewport(): ViewportSnapshot {
  return useSyncExternalStore(subscribeViewport, snapshot, snapshot);
}

function snapshot(): ViewportSnapshot {
  return readViewport(globalThis);
}

export function subscribeViewport(onChange: () => void): () => void {
  if (!isRecord(globalThis) || typeof globalThis.matchMedia !== 'function') return () => undefined;
  const stops = listened.map((query) => listen({ host: globalThis, query, onChange }));
  return () => {
    for (const stop of stops) stop();
  };
}

const listened = [shellQuery.max340, shellQuery.max1279, shellQuery.atLeast768, shellQuery.min1440];

function ask(host: Record<string, unknown>, query: string): boolean | null {
  const matchMedia = host.matchMedia;
  if (typeof matchMedia !== 'function') return null;
  return matchOf(Reflect.apply(matchMedia, host, [query]));
}

function listen(input: {
  readonly host: Record<string, unknown>;
  readonly query: string;
  readonly onChange: () => void;
}): () => void {
  const matchMedia = input.host.matchMedia;
  if (typeof matchMedia !== 'function') return () => undefined;
  const list = Reflect.apply(matchMedia, input.host, [input.query]);
  if (!isRecord(list) || typeof list.addEventListener !== 'function' || typeof list.removeEventListener !== 'function') {
    return () => undefined;
  }
  const add = list.addEventListener;
  const remove = list.removeEventListener;
  Reflect.apply(add, list, ['change', input.onChange]);
  return () => {
    Reflect.apply(remove, list, ['change', input.onChange]);
  };
}

function matchOf(list: unknown): boolean | null {
  if (!isRecord(list) || typeof list.matches !== 'boolean') return null;
  return list.matches;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
