import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { BOM_COLUMNS, compactHeader } from './columns.js';

const FULL_SCORE = 100;

export function detectBom(book: WorkbookLike): { readonly score: number; readonly reasons: readonly string[] } {
  const sheet = book.sheets[0];
  if (sheet === undefined || !isHeader(sheet, 1)) return { score: 0, reasons: ['第一行不是 BOM 表头'] };
  return { score: FULL_SCORE, reasons: ['BOM 表头齐全'] };
}

export function isHeader(sheet: SheetLike, row: number): boolean {
  return BOM_COLUMNS.every((name, index) => compactHeader(sheet.cell(row, index + 1)?.text ?? '') === name);
}
