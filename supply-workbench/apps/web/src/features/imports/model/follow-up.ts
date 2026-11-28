import { EntityIdSchema } from '@sw/contracts';
import { matchPath } from 'react-router';

export const IMPORT_RETURN_PARAM = 'backToImport';
export const IMPORT_SOURCE_DRAWER = 'import-source';

export function importFollowUpScope(params: URLSearchParams): ReturnType<typeof importFollowUpBackAddress> {
  const back = importFollowUpBackAddress(params.get(IMPORT_RETURN_PARAM));
  return back !== null && params.get('importBatchId') === back.id ? back : null;
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
  const encoded = matchPath('/imports/:id', pathname)?.params.id;
  if (encoded === undefined || /[\\\s]/u.test(encoded)) return undefined;
  try {
    const id = decodeURIComponent(encoded);
    if (id.trim() === '' || id === '.' || id === '..' || /[/\\\p{Cc}]|%2f/iu.test(id)) return undefined;
    return EntityIdSchema.safeParse(id).data;
  } catch {
    return undefined;
  }
}
