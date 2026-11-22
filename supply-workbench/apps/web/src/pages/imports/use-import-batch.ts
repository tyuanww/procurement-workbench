import { useEffect, useState } from 'react';
import { ImportBatchSummarySchema, type ImportBatchSummary } from '@sw/contracts';
import { apiErrorMessage, apiGetWithSignal } from '../../shared/api/client.js';

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'ready'; readonly summary: ImportBatchSummary };

export function useImportBatch(id: string) {
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void apiGetWithSignal({ path: `/api/v1/imports/${encodeURIComponent(id)}`, schema: ImportBatchSummarySchema, signal })
      .then((summary) => { if (!signal.aborted) setLoad({ kind: 'ready', summary }); })
      .catch((error: unknown) => {
        if (!signal.aborted) setLoad({ kind: 'failed', message: apiErrorMessage(error) ?? '导入批次没有读出来。' });
      });
    return () => controller.abort();
  }, [id, attempt]);
  return {
    load,
    setSummary: (summary: ImportBatchSummary) => setLoad({ kind: 'ready', summary }),
    retry: () => {
      setLoad({ kind: 'loading' });
      setAttempt((current) => current + 1);
    },
  };
}
