import { useEffect, useState } from 'react';
import type { LineSummary } from '@sw/contracts';
import { failureText, read, readFailureOf } from '../../../shared/api/reads.js';

export function useLineSummary(requestQuery: string): { readonly summary: LineSummary | null; readonly error: string } {
  const [summary, setSummary] = useState<LineSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let isCurrent = true;
    setSummary(null);
    setError('');
    void read({ name: 'linesSummary', query: requestQuery })
      .then((value) => { if (isCurrent) setSummary(value); })
      .catch((caught: unknown) => {
        if (!isCurrent) return;
        const failure = readFailureOf(caught);
        if (failure === null) return;
        setError(failureText(failure));
      });
    return () => { isCurrent = false; };
  }, [requestQuery]);
  return { summary, error };
}
