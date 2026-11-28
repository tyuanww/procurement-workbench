import { ProcurementStoreSchema } from '@sw/contracts';
import { clearOrderLensParams, importBatchOf } from '../../../features/follow-up/index.js';
import { IMPORT_RETURN_PARAM, importFollowUpCandidate } from '../../../features/imports/index.js';

export function retainImportViewFilters(current: URLSearchParams, next: URLSearchParams): void {
  const savedBatch = importBatchOf(next);
  if (savedBatch === undefined) next.delete('store');
  const currentBatch = importBatchOf(current);
  if (currentBatch === undefined) return;
  const store = ProcurementStoreSchema.safeParse(current.get('store')).data;
  if (store !== undefined || importFollowUpCandidate(current) !== null) {
    next.set('importBatchId', currentBatch);
    if (store === undefined) next.delete('store');
    else next.set('store', store);
  } else if (savedBatch === undefined) {
    next.set('importBatchId', currentBatch);
  }
}

export function clearImportScope(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  clearOrderLensParams(next);
  for (const key of ['importBatchId', 'store', IMPORT_RETURN_PARAM, 'page']) next.delete(key);
  return next;
}
