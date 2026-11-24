import { useEffect, useState } from 'react';
import type { LineSummary } from '@sw/contracts';
import { failureText, read, readFailureOf } from '../../../shared/api/reads.js';

type SummaryRequest = { readonly query: string; readonly reload: number };
type SummaryResult = { readonly summary: LineSummary | null; readonly error: string };
const pending: SummaryResult = { summary: null, error: '' };

export function useLineSummary({ query, reload }: SummaryRequest): SummaryResult {
  const [attempt, setAttempt] = useState<SummaryRequest & SummaryResult>({ query, reload, ...pending });
  const isCurrentAttempt = attempt.query === query && attempt.reload === reload;
  if (!isCurrentAttempt) setAttempt({ query, reload, ...pending });
  useEffect(() => {
    const abort = new AbortController();
    void read({ name: 'linesSummary', query, signal: abort.signal })
      .then((summary) => {
        if (!abort.signal.aborted) setAttempt({ query, reload, summary, error: '' });
      })
      .catch((caught: unknown) => {
        if (abort.signal.aborted) return;
        const failure = readFailureOf(caught);
        if (failure !== null) setAttempt({ query, reload, summary: null, error: failureText(failure) });
      });
    return () => abort.abort();
  }, [query, reload]);
  return isCurrentAttempt ? attempt : pending;
}
