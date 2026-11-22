import type { ParsedRow, PoMasterPayload } from '../../../../application/src/ports/parsed-rows.js';
import { cellIssue, poMasterBaseKey, poMasterCandidateKey } from '@sw/domain';

export function candidateKeys(rows: readonly ParsedRow<PoMasterPayload>[]): ReadonlyMap<number, string> {
  const seen = new Map<string, number>();
  const keys = new Map<number, string>();
  for (const row of rows) {
    if (row.skipReason !== null) continue;
    const base = baseKey(row.payload);
    const next = (seen.get(base) ?? 0) + 1;
    seen.set(base, next);
    keys.set(row.rowNo, poMasterCandidateKey(base, next));
  }
  return keys;
}

export function markDuplicates(rows: readonly ParsedRow<PoMasterPayload>[]): ParsedRow<PoMasterPayload>[] {
  const duplicated = duplicateBases(rows);
  return rows.map((row) => withDuplicate(row, duplicated));
}

function withDuplicate(row: ParsedRow<PoMasterPayload>, duplicated: ReadonlySet<string>): ParsedRow<PoMasterPayload> {
  const base = baseKey(row.payload);
  if (!duplicated.has(base)) return row;
  return { ...row, issues: [...row.issues, cellIssue({ code: 'KEY_DUPLICATE_IN_FILE', raw: base })] };
}

function duplicateBases(rows: readonly ParsedRow<PoMasterPayload>[]): Set<string> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const base = baseKey(row.payload);
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([base]) => base));
}

function baseKey(payload: PoMasterPayload): string {
  return poMasterBaseKey({
    poNorm: payload.po.value?.poNorm ?? null,
    barcode: payload.barcodeRaw.value,
    nameRaw: payload.nameRaw.value,
  });
}
