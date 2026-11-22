import type { WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { masterSheet, readHeader } from './headers.js';

const FULL_SCORE = 100;

export function detectPoMaster(book: WorkbookLike): { readonly score: number; readonly reasons: readonly string[] } {
  const sheet = masterSheet(book);
  if (sheet === undefined) return { score: 0, reasons: ['没有表'] };
  const header = readHeader(sheet);
  if (header.missing.length > 0) return { score: 0, reasons: header.missing.map((name) => `缺少 ${name}`) };
  return { score: FULL_SCORE, reasons: ['17 列表头齐全', ...header.optional.map((name) => `识别可选列 ${name}`), ...header.extra.map((name) => `忽略多余列 ${name}`)] };
}
