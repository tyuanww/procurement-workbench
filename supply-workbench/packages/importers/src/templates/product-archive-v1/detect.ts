import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { readHeader } from './headers.js';

const FULL_SCORE = 100;

export function detectProductArchive(book: WorkbookLike): { readonly score: number; readonly reasons: readonly string[] } {
  const sheet = book.sheets[0];
  if (sheet === undefined) return { score: 0, reasons: ['没有表'] };
  const header = readHeader(sheet);
  if (header.missing.length > 0) return { score: 0, reasons: header.missing.map((name) => `缺少 ${name}`) };
  return { score: FULL_SCORE, reasons: ['产品档案表头齐全'] };
}
