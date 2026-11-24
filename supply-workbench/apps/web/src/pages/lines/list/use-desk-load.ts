import { useEffect, useState } from 'react';
import type { OrderLineRow } from '@sw/contracts';
import { failureText, read, readFailureOf } from '../../../shared/api/reads.js';

type DeskLoad =
  | { readonly kind: 'pending' }
  | { readonly kind: 'ready'; readonly rows: readonly OrderLineRow[]; readonly total: number }
  | { readonly kind: 'failed'; readonly message: string };

type DeskRequest = {
  readonly query: string;
  readonly reload: number;
};

type DeskAttempt = DeskRequest & { readonly result: DeskLoad };

const pending: DeskLoad = { kind: 'pending' };

export function useDeskLoad({ query, reload }: DeskRequest): DeskLoad {
  const [attempt, setAttempt] = useState<DeskAttempt>({ query, reload, result: pending });
  const isCurrentAttempt = attempt.query === query && attempt.reload === reload;
  if (!isCurrentAttempt) setAttempt({ query, reload, result: pending });
  useEffect(() => {
    const abort = new AbortController();
    const settle = (result: DeskLoad) => {
      if (abort.signal.aborted) return;
      setAttempt((current) => current.query === query && current.reload === reload ? { query, reload, result } : current);
    };
    void read({ name: 'lines', query, signal: abort.signal }).then((page) => {
      settle({ kind: 'ready', rows: page.items, total: page.page.total });
    }).catch((error: unknown) => {
      const failure = readFailureOf(error);
      settle({
        kind: 'failed',
        message: failure === null ? '订单行请求已中断。请重试。' : failureText(failure),
      });
    });
    return () => abort.abort();
  }, [query, reload]);
  return isCurrentAttempt ? attempt.result : pending;
}
