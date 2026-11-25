import { useCallback, useEffect, useReducer, useState } from 'react';
import type { PersonalTodayResponse } from '@sw/contracts';
import { fetchPersonalToday } from '../../shared/api/catalog.js';
import { failureText, readFailureOf } from '../../shared/api/failure.js';

type Load = { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: PersonalTodayResponse; readonly query: string }
  | { readonly kind: 'error'; readonly message: string; readonly query: string };

export function usePersonalToday(query: string, isDrawerOpen: boolean) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [revision, reload] = useReducer((previous: number) => previous + 1, 0);
  useEffect(() => {
    const request = new AbortController();
    void fetchPersonalToday(query, request.signal).then((data) => {
      if (!request.signal.aborted) setLoad({ kind: 'ready', data, query });
    }).catch((error: unknown) => {
      const failure = readFailureOf(error);
      if (!request.signal.aborted && failure !== null) setLoad({ kind: 'error', message: failureText(failure), query });
    });
    return () => request.abort();
  }, [query, revision]);
  const retry = useCallback(() => { setLoad({ kind: 'loading' }); reload(); }, [reload]);
  useEffect(() => {
    if (isDrawerOpen) return;
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [isDrawerOpen]);
  return { load: currentLoad(load, query), previousData: load.kind === 'ready' ? load.data : null, retry };
}

function currentLoad(load: Load, query: string): Load {
  if (load.kind === 'loading' || load.query === query) return load;
  if (load.kind === 'ready' && isSameBatchPage({ load, query })) return load;
  return { kind: 'loading' };
}

function isSameBatchPage({ load, query }: { readonly load: Extract<Load, { kind: 'ready' }>; readonly query: string }): boolean {
  const current = new URLSearchParams(query);
  const previous = new URLSearchParams(load.query);
  const focusId = current.get('focusId');
  current.delete('focusId');
  previous.delete('focusId');
  if (current.toString() !== previous.toString()) return false;
  return focusId === null ? load.data.page === Number(current.get('page')) : load.data.items.some((item) => item.id === focusId);
}
