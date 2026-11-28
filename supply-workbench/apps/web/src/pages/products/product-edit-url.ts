import { writeUrlState } from '../../shared/hooks/url-state.js';
import { productSection } from './product-section.js';

export const purchaseRecordParam = 'purchaseRecord';

export function resolveProductDetailDrawers(search: URLSearchParams, canEdit: boolean): URLSearchParams {
  if (!search.has(purchaseRecordParam)) return search;
  const isPurchases = productSection(search) === 'purchases';
  const isEditOpen = search.get('drawer') === 'edit';
  if (isPurchases && !isEditOpen) return search;
  const next = new URLSearchParams(search);
  if (!isPurchases || (isEditOpen && canEdit)) next.delete(purchaseRecordParam);
  if (isEditOpen && !canEdit) next.delete('drawer');
  return next;
}

export function readProductEdit(search: string): boolean {
  return new URLSearchParams(search).get('drawer') === 'edit';
}

export function writeProductEdit(input: {
  readonly search: string;
  readonly isOpen: boolean;
}): URLSearchParams {
  return new URLSearchParams(writeUrlState(input.search, input.isOpen ? { drawer: 'edit', [purchaseRecordParam]: null } : { drawer: null }));
}

export function writeWorkbookBatch(input: {
  readonly search: string;
  readonly batchId: string | null;
}): URLSearchParams {
  return new URLSearchParams(writeUrlState(input.search, { workbookBatch: input.batchId }));
}
