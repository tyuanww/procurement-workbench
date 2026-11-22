import { useEffect, useRef, useState } from 'react';
import { failureText, readFailureOf } from '../../../shared/api/reads.js';
import type { OrderLineRow } from '@sw/contracts';
import { loadDeskList, type ListGate } from './actions.js';

export type DeskLoad = {
  readonly isUpdating: boolean;
  readonly hasLoaded: boolean;
  readonly loadError: string;
};

export function useDeskLoad(input: {
  readonly query: string;
  readonly gate: ListGate;
  readonly setRows: (rows: readonly OrderLineRow[]) => void;
  readonly setTotal: (total: number) => void;
  readonly reload: number;
}): DeskLoad {
  const [isUpdating, setUpdating] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const pending = useRef(0);
  const { query, gate, setRows, setTotal, reload } = input;
  useEffect(() => {
    setLoadError('');
    pending.current += 1;
    const current = pending.current;
    setUpdating(true);
    void loadDeskList({ query, gate, setRows, setTotal })
      .then(() => { if (pending.current === current) setHasLoaded(true); })
      .catch((error: unknown) => {
        if (pending.current !== current) return;
        const failure = readFailureOf(error);
        if (failure === null) return;
        setLoadError(failureText(failure));
        setHasLoaded(true);
      })
      .finally(() => { if (pending.current === current) setUpdating(false); });
  }, [query, gate, setRows, setTotal, reload]);
  return { isUpdating, hasLoaded, loadError };
}
