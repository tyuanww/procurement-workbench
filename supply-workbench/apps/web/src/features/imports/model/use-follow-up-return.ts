import { createContext, useContext, useEffect, useState } from 'react';
import { ImportBatchSummarySchema } from '@sw/contracts';
import { apiGetWithSignal } from '../../../shared/api/client.js';
import { importFollowUpCandidate } from './follow-up.js';

export const VerifiedProcurementImportReturn = createContext(false);
export function useVerifiedProcurementImportReturnContext(): boolean {
  return useContext(VerifiedProcurementImportReturn);
}

export function fetchImportBatchSummary(id: string, signal: AbortSignal) {
  return apiGetWithSignal({ path: `/api/v1/imports/${encodeURIComponent(id)}`, schema: ImportBatchSummarySchema, signal });
}

export function useVerifiedProcurementImportReturn(params: URLSearchParams, enabled: boolean): boolean {
  const candidate = enabled ? importFollowUpCandidate(params) : null;
  const importId = candidate?.needsProcurementVerification === true ? candidate.id : null;
  const [verified, setVerified] = useState<string | null>(null);
  useEffect(() => {
    if (importId === null) return;
    const controller = new AbortController();
    const { signal } = controller;
    void fetchImportBatchSummary(importId, signal).then((summary) => {
      if (!signal.aborted) setVerified(summary.template === 'po-master-v1' && summary.status === 'committed' ? importId : null);
    }).catch(() => { if (!signal.aborted) setVerified(null); });
    return () => controller.abort();
  }, [importId]);
  return importId !== null && importId === verified;
}
