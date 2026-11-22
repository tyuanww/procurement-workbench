import type { ImportExisting, ParsedRow, PoMasterPayload } from '../../../../application/src/ports/parsed-rows.js';
import type { PoMasterParsed } from '../../../../application/src/ports/parsed-rows.js';
import { cellIssue } from '@sw/domain';
import { candidateKeys } from './keys.js';
import { samePoMasterPayload } from '../../../../application/src/imports/po-master-payload.js';

type ExistingRow = ImportExisting['poMaster'][number];
type DiffRow = PoMasterParsed['rows'][number];

export function diffPoMaster(parsed: PoMasterParsed, existing: ImportExisting): PoMasterParsed {
  const keys = candidateKeys(parsed.rows);
  return { ...parsed, rows: parsed.rows.map((row) => mark({ row, key: keys.get(row.rowNo), existing: existing.poMaster, trackComparison: parsed.procurement !== undefined })) };
}

function mark({ row, key, existing, trackComparison }: {
  readonly row: DiffRow;
  readonly key: string | undefined;
  readonly existing: readonly ExistingRow[];
  readonly trackComparison: boolean;
}): DiffRow {
  if (row.skipReason !== null) return { ...row, action: 'skip' };
  const hits = existing.filter((item) => isMatch({ candidateKey: item.candidateKey, row, key }));
  if (hits.length > 1) return conflict(row, key);
  const only = hits[0];
  if (only === undefined) return { ...row, action: 'create' };
  return {
    ...row,
    action: samePoMasterPayload(only.values, row.payload) ? 'unchanged' : 'update',
    ...(trackComparison ? { comparedPayload: only.values } : {}),
  };
}

function isMatch({ candidateKey, row, key }: { readonly candidateKey: string; readonly row: ParsedRow<PoMasterPayload>; readonly key: string | undefined }): boolean {
  if (candidateKey === `${row.sheetName}:${row.rowNo}`) return true;
  return key !== undefined && candidateKey === key;
}

function conflict(row: ParsedRow<PoMasterPayload>, key: string | undefined): ParsedRow<PoMasterPayload> {
  if (row.issues.some((issue) => issue.code === 'KEY_AMBIGUOUS_EXISTING')) return { ...row, action: 'conflict' };
  return { ...row, action: 'conflict', issues: [...row.issues, cellIssue({ code: 'KEY_AMBIGUOUS_EXISTING', raw: key ?? null })] };
}
