import { EntityIdSchema, ProcurementStoreSchema } from '@sw/contracts';
import { matchPath } from 'react-router';

export const IMPORT_RETURN_PARAM = 'backToImport';
export const IMPORT_SOURCE_DRAWER = 'import-source';
export const BATCH_IMPORT_SOURCE = 'batch';
export const PROCUREMENT_BATCH_IMPORT_SOURCE = 'procurement-batch';

const shopSchema = ProcurementStoreSchema.exclude(['all']);

export function isBatchImportSource(key: string | null): boolean {
  return key === BATCH_IMPORT_SOURCE || key === PROCUREMENT_BATCH_IMPORT_SOURCE;
}

export function importFollowUpScope(params: URLSearchParams): ReturnType<typeof importFollowUpBackAddress> {
  const back = importFollowUpBackAddress(params.get(IMPORT_RETURN_PARAM));
  if (back === null || params.get('importBatchId') !== back.id) return null;
  const store = shopSchema.safeParse(params.get('store')).data;
  const separator = back.to.indexOf('?');
  const sourceQuery = new URLSearchParams(back.to.slice(separator));
  const sourceStore = shopSchema.safeParse(sourceQuery.get('store')).data;
  if (back.recordKey === PROCUREMENT_BATCH_IMPORT_SOURCE) return store === undefined ? back : null;
  if (store === sourceStore || (store === undefined && !isBatchImportSource(back.recordKey))) return back;
  if (store !== undefined || sourceQuery.get('template') !== 'po-master-v1') return null;
  sourceQuery.set('source', PROCUREMENT_BATCH_IMPORT_SOURCE);
  return { ...back, to: `${back.to.slice(0, separator)}?${sourceQuery}`, recordKey: PROCUREMENT_BATCH_IMPORT_SOURCE };
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
    const path = pathname.replace(/^\/[^/]+/u, (section) => decodeURIComponent(section));
    const encoded = matchPath('/imports/:id', path)?.params.id;
    if (encoded === undefined || /[\\\s]/u.test(encoded)) return undefined;
    const id = decodeURIComponent(encoded);
    if (id.trim() === '' || id === '.' || id === '..' || /[/\\\p{Cc}]|%2f/iu.test(id)) return undefined;
    return EntityIdSchema.safeParse(id).data;
  } catch {
    return undefined;
  }
}
