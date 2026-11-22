import type { ImportExisting, OwnerMapParsed, ParsedRow, OwnerMapPayload } from '../../../../application/src/ports/parsed-rows.js';

export function diffOwnerMap(parsed: OwnerMapParsed, existing: ImportExisting): OwnerMapParsed {
  void existing;
  return { ...parsed, rows: parsed.rows.map(mark) };
}

function mark(row: ParsedRow<OwnerMapPayload>): ParsedRow<OwnerMapPayload> {
  return { ...row, action: row.skipReason === null ? 'create' : 'skip' };
}
