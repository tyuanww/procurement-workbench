import type { SheetLike, WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { OWNER_MAP_COLUMNS, compactHeader } from './columns.js';

const FULL_SCORE = 100;

export function detectOwnerMap(book: WorkbookLike): { readonly score: number; readonly reasons: readonly string[] } {
  const sheet = book.sheets[0];
  if (sheet === undefined || !isHeader(sheet, 1)) return { score: 0, reasons: ['第一行不是负责人映射表头'] };
  return { score: FULL_SCORE, reasons: ['负责人映射表头齐全'] };
}

export function isHeader(sheet: SheetLike, row: number): boolean {
  return OWNER_MAP_COLUMNS.every((name, index) => compactHeader(sheet.cell(row, index + 1)?.text ?? '') === name);
}
