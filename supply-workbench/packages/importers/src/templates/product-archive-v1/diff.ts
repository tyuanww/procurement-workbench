import type { ImportExisting, ParsedRow, ProductArchiveParsed, ProductArchivePayload } from '../../../../application/src/ports/parsed-rows.js';
import { cellIssue } from '@sw/domain';

export function diffProductArchive(parsed: ProductArchiveParsed, existing: ImportExisting): ProductArchiveParsed {
  return { ...parsed, rows: parsed.rows.map((row) => mark(row, existing.products)) };
}

function mark(row: ParsedRow<ProductArchivePayload>, products: ImportExisting['products']): ParsedRow<ProductArchivePayload> {
  if (row.skipReason !== null) return { ...row, action: 'skip' };
  const hit = products.find((item) => item.barcodeRaw === row.payload.barcodeRaw.value || item.barcodeRaw === `${row.sheetName}:${row.rowNo}`);
  if (hit === undefined) return { ...row, action: 'create' };
  return { ...row, action: 'unchanged', issues: [...row.issues, ...keptIssues(row, hit.keptFields)] };
}

function keptIssues(row: ParsedRow<ProductArchivePayload>, kept: ImportExisting['products'][number]['keptFields']): ReturnType<typeof cellIssue>[] {
  return kept.map((field) => cellIssue({ code: 'PRODUCT_FIELD_KEPT', raw: fileValue(row, field), column: field }));
}

function fileValue(row: ParsedRow<ProductArchivePayload>, field: ImportExisting['products'][number]['keptFields'][number]): string | null {
  if (field === 'productLine') return null;
  return row.payload[field].value;
}
