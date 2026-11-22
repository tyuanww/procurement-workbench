import type { SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import { REQUIRED_COLUMNS, compactHeader } from './columns.js';

const HEADER_SCAN = 40;
const BLANK_RUN = 3;

export type ArchiveHeader = {
  readonly columns: ReadonlyMap<string, number>;
  readonly missing: readonly string[];
};

export function readHeader(sheet: SheetLike): ArchiveHeader {
  const found = headerCells(sheet);
  const columns = new Map(found.map((item) => [item.name, item.col]));
  return { columns, missing: REQUIRED_COLUMNS.filter((name) => !columns.has(compactHeader(name))) };
}

function headerCells(sheet: SheetLike): { readonly name: string; readonly col: number }[] {
  const found: { readonly name: string; readonly col: number }[] = [];
  let blanks = 0;
  for (let col = 1; col <= HEADER_SCAN && blanks < BLANK_RUN; col += 1) {
    const cell = sheet.cell(1, col);
    if (cell === null || cell.text.trim() === '') {
      blanks += 1;
      continue;
    }
    blanks = 0;
    found.push({ name: compactHeader(cell.text), col });
  }
  return found;
}
