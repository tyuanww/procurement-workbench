import { ConfirmedArrivalPayloadSchema, EntityIdSchema, ImportRowViewSchema, listResponseSchema } from '@sw/contracts';
import { createContext, useEffect, useState } from 'react';
import { fetchImportBatchSummary, IMPORT_RETURN_PARAM, importFollowUpBackAddress, procurementImportSourceOf, useImportReturnTemplate } from '../../../features/imports/index.js';
import { apiGetWithSignal } from '../../../shared/api/client.js';
import { ARRIVAL_SOURCE_PAGE_SIZE, importSourceKey, readArrivalImportSource } from '../../imports/import-source.js';
import { componentSourceLineId, fetchProcurementPreview, procurementPreviewOa, visibleProcurement } from '../../imports/procurement-preview-model.js';
import { useRelatedImportMembers } from './related-procurement-navigation.js';

export const LineImportMembership = createContext({ isImportMember: false, isCheckingImportMembership: false });

export function useDetailImportProof({ params, lineId, canReadImports }: {
  readonly params: URLSearchParams; readonly lineId: string; readonly canReadImports: boolean;
}) {
  const membership = useImportLineMember({ params, lineId });
  const importReturnTemplate = useImportReturnTemplate(params, canReadImports && membership.isImportMember);
  const isProcurementSourceRow = useVerifiedProcurementRow({
    address: importReturnTemplate === 'po-master-v1' ? params.get(IMPORT_RETURN_PARAM) : null, lineId,
  });
  const isConfirmedArrival = useConfirmedArrivalReturn({ params, lineId, canReadImports });
  return { ...membership, importReturnTemplate, isProcurementSourceRow, confirmedArrival: isConfirmedArrival };
}

function useVerifiedProcurementRow({ address, lineId }: { readonly address: string | null; readonly lineId: string }): boolean {
  const key = JSON.stringify([address, lineId]);
  const [verified, setVerified] = useState<string>();
  useEffect(() => {
    const back = importFollowUpBackAddress(address);
    if (back === null || procurementImportSourceOf(back.recordKey) === undefined) return;
    const { id, to, recordKey } = back;
    const oa = procurementPreviewOa(new URLSearchParams(to.slice(to.indexOf('?'))));
    const abort = new AbortController();
    void fetchProcurementPreview({ id, oa, signal: abort.signal }).then((preview) => {
      if (abort.signal.aborted || preview?.submission?.originalBatchId !== id) return;
      const { rows, related } = visibleProcurement(preview);
      const finished = rows.find((row) => importSourceKey('finished', row.source) === recordKey);
      const component = related.find(({ fact }) => importSourceKey('component', fact.source) === recordKey);
      const target = component === undefined ? finished?.orderLineId : componentSourceLineId(component);
      if (target === lineId) setVerified(key);
    }, () => undefined);
    return () => abort.abort();
  }, [address, key, lineId]);
  return verified === key;
}

export function useImportLineMember({ params, lineId, enabled = true }: {
  readonly params: URLSearchParams; readonly lineId: string; readonly enabled?: boolean;
}) {
  const batch = enabled && lineId !== '' ? EntityIdSchema.safeParse(params.get('importBatchId')).data : undefined;
  const members = useRelatedImportMembers({ batch, store: params.get('store'), lines: [{ id: lineId }] });
  return { isImportMember: members?.has(lineId) === true, isCheckingImportMembership: members === undefined };
}

const rowsSchema = listResponseSchema(ImportRowViewSchema);

function useConfirmedArrivalReturn({ params, lineId, canReadImports }: {
  readonly params: URLSearchParams; readonly lineId: string; readonly canReadImports: boolean;
}): boolean {
  const address = canReadImports && !params.has('importBatchId') ? params.get(IMPORT_RETURN_PARAM) : null;
  const focusBatch = EntityIdSchema.safeParse(params.get('focusBatch')).data;
  const key = JSON.stringify([address, focusBatch, lineId]);
  const [verified, setVerified] = useState<string>();
  useEffect(() => {
    const back = importFollowUpBackAddress(address);
    const source = readArrivalImportSource(back?.recordKey ?? null);
    if (back === null || source === undefined || focusBatch === undefined || lineId === '') return;
    const abort = new AbortController();
    void verifyConfirmedArrival({ importId: back.id, source, focusBatch, lineId, signal: abort.signal }).then((matches) => {
      if (matches && !abort.signal.aborted) setVerified(key);
    }, () => undefined);
    return () => abort.abort();
  }, [address, focusBatch, key, lineId]);
  return verified === key;
}

async function verifyConfirmedArrival({ importId, source, focusBatch, lineId, signal }: {
  readonly importId: string; readonly source: NonNullable<ReturnType<typeof readArrivalImportSource>>;
  readonly focusBatch: string; readonly lineId: string; readonly signal: AbortSignal;
}): Promise<boolean> {
  const path = `/api/v1/imports/${encodeURIComponent(importId)}`;
  const summary = await fetchImportBatchSummary(importId, signal);
  if (summary.template !== 'batch-confirmed-arrival-v1' || summary.status !== 'committed') return false;
  const query = new URLSearchParams({ page: String(source.page), pageSize: String(ARRIVAL_SOURCE_PAGE_SIZE) });
  const { items } = await apiGetWithSignal({ path: `${path}/rows?${query}`, schema: rowsSchema, signal });
  const row = items.find(({ sheetName, rowNo }) => sheetName === source.sheetName && rowNo === source.rowNo);
  if (row === undefined || (row.action !== 'update' && row.action !== 'unchanged')) return false;
  const payload = ConfirmedArrivalPayloadSchema.safeParse(row.parsed).data;
  return payload?.batchId === focusBatch && payload.exportedLineId === lineId;
}
