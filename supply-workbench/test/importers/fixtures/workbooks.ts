import type { SheetLike, WorkbookLike } from '../../../packages/application/src/ports/workbook-reader.js';
import { readCsv } from '../../../packages/importers/src/workbook/index.js';
import { buildSheet, cellKey, type CellDraft, type ImageAnchor, type MergeRange } from '../../../packages/importers/src/workbook/sheet.js';
import { REQUIRED_COLUMNS } from '../../../packages/importers/src/templates/po-master-v1/columns.js';

export function csvBytes(rows: readonly (readonly (string | number | null)[])[]): Uint8Array {
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
  return new TextEncoder().encode(csv);
}

export function poCsv(rows: readonly Readonly<Record<string, string>>[]): Uint8Array {
  return csvBytes([REQUIRED_COLUMNS, ...rows.map((row) => REQUIRED_COLUMNS.map((header) => row[header] ?? ''))]);
}

export const foreignBook = readCsv(csvBytes([['示例列'], ['示例值']]), 'unrelated.csv');

export function workbook(sheets: readonly SheetLike[]): WorkbookLike {
  return { source: { kind: 'xlsx', fileName: 'example.xlsx' }, date1904: false, sheets };
}

export function sheet(input: {
  readonly name: string;
  readonly rows: readonly (readonly (string | number | CellDraft | null)[])[];
  readonly hidden?: boolean;
  readonly merges?: readonly MergeRange[];
  readonly images?: readonly ImageAnchor[];
}): SheetLike {
  const cells = new Map<string, CellDraft>();
  for (const [row, values] of input.rows.entries()) {
    for (const [column, value] of values.entries()) {
      if (value === null) continue;
      const cell = typeof value === 'object'
        ? value
        : { kind: typeof value === 'number' ? 'number' : 'string', value, text: String(value) } satisfies CellDraft;
      cells.set(cellKey(row + 1, column + 1), cell);
    }
  }
  return buildSheet({ name: input.name, hidden: input.hidden ?? false, cells, merges: input.merges ?? [], ...(input.images === undefined ? {} : { images: input.images }) });
}
