import { EntityIdSchema, ProcurementStoreSchema } from '@sw/contracts';
import { matchPath } from 'react-router';
import { z } from 'zod';

export const IMPORT_RETURN_PARAM = 'backToImport';
export const IMPORT_SOURCE_DRAWER = 'import-source';
export const BATCH_IMPORT_SOURCE = 'batch';
export const PROCUREMENT_BATCH_IMPORT_SOURCE = 'procurement-batch';

const shopSchema = ProcurementStoreSchema.exclude(['all']);
const procurementSource = z.tuple([z.enum(['finished', 'component']), z.string(), z.number().int().positive()]);

export type VerifiedImportReturnTemplate = 'factory-progress-v1' | 'po-master-v1';

export function isBatchImportSource(key: string | null): boolean {
  return key === BATCH_IMPORT_SOURCE || key === PROCUREMENT_BATCH_IMPORT_SOURCE;
}

export function importFollowUpCandidate(params: URLSearchParams) {
  const back = importFollowUpBackAddress(params.get(IMPORT_RETURN_PARAM));
  if (back === null || params.get('importBatchId') !== back.id) return null;
  if (!isBatchImportSource(back.recordKey) && procurementImportSourceOf(back.recordKey) === undefined) return null;
  return back;
}

export function importFollowUpScope(params: URLSearchParams, { template, isProcurementSourceRow = false }: {
  readonly template: VerifiedImportReturnTemplate | null | undefined;
  readonly isProcurementSourceRow?: boolean;
}): ReturnType<typeof importFollowUpBackAddress> {
  const back = importFollowUpCandidate(params);
  if (back === null || template == null) return null;
  const store = shopSchema.safeParse(params.get('store')).data;
  const sourceQuery = new URLSearchParams(back.to.slice(back.to.indexOf('?')));
  const sourceStore = shopSchema.safeParse(sourceQuery.get('store')).data;
  if (template === 'factory-progress-v1') return back.recordKey === BATCH_IMPORT_SOURCE && store === sourceStore ? back : null;
  if (store !== undefined) return null;
  return isBatchImportSource(back.recordKey) || isProcurementSourceRow ? back : null;
}

export function procurementImportSourceOf(key: string) {
  try {
    return procurementSource.safeParse(JSON.parse(key)).data;
  } catch {
    return undefined;
  }
}

export function importFollowUpBackAddress(value: string | null): { readonly id: string; readonly to: string; readonly recordKey: string } | null {
  if (value === null) return null;
  const separator = value.indexOf('?');
  if (separator === -1 || value.includes('#')) return null;
  const id = importRouteId(value.slice(0, separator));
  const query = new URLSearchParams(value.slice(separator));
  const recordKey = query.get('source');
  if (id === undefined || query.get('drawer') !== IMPORT_SOURCE_DRAWER || recordKey === null || recordKey === '') return null;
  return { id, to: value, recordKey };
}

function importRouteId(pathname: string): string | undefined {
  try {
    const path = pathname.replace(/^\/[^/]+/u, (segment) =>
      decodeURIComponent(segment).toLowerCase() === '/imports' ? '/imports' : segment);
    const encoded = matchPath('/imports/:id', path)?.params.id;
    if (encoded === undefined || /[\\\s]/u.test(encoded)) return undefined;
    const id = decodeURIComponent(encoded);
    if (id.trim() === '' || id === '.' || id === '..' || /[/\\\p{Cc}]|%2f/iu.test(id)) return undefined;
    return EntityIdSchema.safeParse(id).data;
  } catch {
    return undefined;
  }
}
