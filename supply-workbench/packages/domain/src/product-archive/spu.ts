import { normalizeText } from '../identity/text.js';

export const UNFILED_FILING_NAME = '未填备案名称';

export function spuKey(filingName: string | null): string | null {
  if (filingName === null) return null;
  const key = normalizeText(filingName);
  return key === '' ? null : key;
}

export function spuGroupName(filingName: string | null): string {
  const key = spuKey(filingName);
  return key === null ? UNFILED_FILING_NAME : filingName ?? UNFILED_FILING_NAME;
}
