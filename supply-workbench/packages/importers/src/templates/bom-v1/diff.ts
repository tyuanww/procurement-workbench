import type { BomParsed, ImportExisting, ParsedRow, BomPayload } from '../../../../application/src/ports/parsed-rows.js';

export function diffBom(parsed: BomParsed, existing: ImportExisting): BomParsed {
  return { ...parsed, rows: parsed.rows.map((row) => mark(row, existing.bomKeys)) };
}

function mark(row: ParsedRow<BomPayload>, keys: ImportExisting['bomKeys']): ParsedRow<BomPayload> {
  if (row.skipReason !== null) return { ...row, action: 'skip' };
  const isKnown = keys.some((key) => key.productBarcodeRaw === row.payload.productBarcodeRaw && key.partCodeRaw === row.payload.partCodeRaw);
  return { ...row, action: isKnown ? 'unchanged' : 'create' };
}
