import { EntityIdSchema } from '@sw/contracts';

export const IMPORT_RETURN_PARAM = 'backToImport';
export const IMPORT_SOURCE_DRAWER = 'import-source';

export function importFollowUpBackAddress(value: string | null): { readonly id: string; readonly to: string; readonly recordKey: string } | null {
  if (value === null || !value.startsWith('/imports/')) return null;
  const separator = value.indexOf('?');
  if (separator === -1 || value.includes('#')) return null;
  const pathname = value.slice(0, separator);
  if (!/^\/imports\/[a-z\d_-]+$/iu.test(pathname)) return null;
  const id = EntityIdSchema.safeParse(pathname.slice('/imports/'.length)).data;
  const query = new URLSearchParams(value.slice(separator));
  const recordKey = query.get('source');
  if (id === undefined || query.get('drawer') !== IMPORT_SOURCE_DRAWER || recordKey === null || recordKey === '') return null;
  return { id, to: value, recordKey };
}
