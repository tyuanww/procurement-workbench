import { parse } from 'csv-parse/sync';
import type { WorkbookLike } from '../../../application/src/ports/workbook-reader.js';
import { buildSheet, cellKey, type CellDraft } from './sheet.js';

export function readCsv(bytes: Uint8Array, fileName: string): WorkbookLike {
  const text = new TextDecoder('utf-8').decode(bytes);
  const parsed: unknown = parse(text, { bom: true, relax_quotes: true, relax_column_count: true });
  return {
    source: { kind: 'csv', fileName },
    date1904: false,
    sheets: [buildSheet({ name: fileName, hidden: false, cells: cellsOf(rowsOf(parsed)), merges: [] })],
  };
}

function rowsOf(value: unknown): string[][] {
  if (!Array.isArray(value)) throw new Error('CSV 没有解析成行');
  return value.map(rowOf);
}

function rowOf(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('CSV 没有解析成行');
  const cells: string[] = [];
  for (const cell of value) {
    if (typeof cell !== 'string') throw new Error('CSV 单元格不是文本');
    cells.push(cell);
  }
  return cells;
}

function cellsOf(rows: readonly (readonly string[])[]): Map<string, CellDraft> {
  const cells = new Map<string, CellDraft>();
  rows.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      cells.set(cellKey(rowIndex + 1, colIndex + 1), { kind: 'string', value, text: value });
    });
  });
  return cells;
}
