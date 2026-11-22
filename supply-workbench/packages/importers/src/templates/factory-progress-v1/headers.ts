import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import { canonicalColumnName, type ColumnSpec } from './spec/index.js';

const HEADER_SCAN_ROWS = 3;
const COLUMN_SCAN = 40;

export type HeaderMap = {
  readonly headerRow: number;
  readonly used: ReadonlySet<number>;
  col(name: string, occurrence?: number): number | null;
};

export function findHeader(sheet: SheetLike, columns: readonly ColumnSpec[]): HeaderMap | null {
  for (let row = 1; row <= HEADER_SCAN_ROWS; row += 1) {
    const hits = collect(sheet, row);
    if (!covers(hits, columns)) continue;
    return mapOf(row, hits);
  }
  return null;
}

export function rowMark(sheet: SheetLike, row: number): 'empty' | 'ok' | 'data' {
  const texts: string[] = [];
  for (let col = 1; col <= COLUMN_SCAN; col += 1) {
    const text = sheet.cell(row, col)?.text.trim() ?? '';
    if (text !== '') texts.push(text);
  }
  if (texts.length === 0) return 'empty';
  if (texts.every((text) => text === 'OK')) return 'ok';
  return 'data';
}

function mapOf(headerRow: number, hits: ReadonlyMap<string, number[]>): HeaderMap {
  const used = new Set<number>();
  for (const cols of hits.values()) for (const col of cols) used.add(col);
  return {
    headerRow,
    used,
    col(name, occurrence = 1) {
      return hits.get(name)?.[occurrence - 1] ?? null;
    },
  };
}

function collect(sheet: SheetLike, row: number): Map<string, number[]> {
  const hits = new Map<string, number[]>();
  for (let col = 1; col <= COLUMN_SCAN; col += 1) {
    const name = canonicalColumnName(sheet.cell(row, col)?.text ?? '');
    if (name === null) continue;
    const cols = hits.get(name) ?? [];
    cols.push(col);
    hits.set(name, cols);
  }
  return hits;
}

function covers(hits: ReadonlyMap<string, number[]>, columns: readonly ColumnSpec[]): boolean {
  return columns.filter((column) => column.required).every((column) => (hits.get(column.name)?.length ?? 0) >= column.occurrence);
}
