import { createContext, useContext, useEffect, useState } from 'react';
import { ImportBatchSummarySchema } from '@sw/contracts';
import { apiGetWithSignal } from '../../../shared/api/client.js';
import { importFollowUpCandidate, type VerifiedImportReturnTemplate } from './follow-up.js';

export const ImportReturnTemplateContext = createContext<VerifiedImportReturnTemplate | null | undefined>(null);
export function useImportReturnTemplateContext() {
  return useContext(ImportReturnTemplateContext);
}

export function fetchImportBatchSummary(id: string, signal: AbortSignal) {
  return apiGetWithSignal({ path: `/api/v1/imports/${encodeURIComponent(id)}`, schema: ImportBatchSummarySchema, signal });
}

export function useImportReturnTemplate(params: URLSearchParams, enabled: boolean): VerifiedImportReturnTemplate | null | undefined {
  const candidate = enabled ? importFollowUpCandidate(params) : null;
  const importId = candidate?.id ?? null;
  const [result, setResult] = useState<{ readonly id: string; readonly template: VerifiedImportReturnTemplate | null }>();
  useEffect(() => {
    if (importId === null) return;
    const controller = new AbortController();
    const { signal } = controller;
    void fetchImportBatchSummary(importId, signal).then((summary) => {
      if (signal.aborted) return;
      const { template } = summary;
      const isKnown = template === 'po-master-v1' || template === 'factory-progress-v1';
      setResult({ id: importId, template: summary.status === 'committed' && isKnown ? template : null });
    }).catch(() => { if (!signal.aborted) setResult({ id: importId, template: null }); });
    return () => controller.abort();
  }, [importId]);
  if (importId === null) return null;
  return importId === result?.id ? result.template : undefined;
}
