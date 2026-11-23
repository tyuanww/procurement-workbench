import type { SheetLike, WorkbookLike } from '../../../../application/src/ports/workbook-reader.js';
import { OPTIONAL_COLUMNS, PO_MASTER_SHEET_NAME, REQUIRED_COLUMNS, compactHeader } from './columns.js';

const HEADER_SCAN = 40;
const BLANK_RUN = 3;

export type PoHeader = {
  readonly columns: ReadonlyMap<string, number>;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  /** 出现且被识别的可选列。 */
  readonly optional: readonly string[];
};

export function masterSheet(book: WorkbookLike): SheetLike | undefined {
  return book.sheets.find((sheet) => sheet.name.trim() === PO_MASTER_SHEET_NAME) ?? book.sheets[0];
}

export function readHeader(sheet: SheetLike): PoHeader {
  const found = headerCells(sheet);
  const columns = new Map(found.map((item) => [item.name, item.col]));
  return {
    columns,
    missing: REQUIRED_COLUMNS.filter((name) => !columns.has(name)),
    extra: found.filter((item) => !isRequired(item.name) && !isOptional(item.name)).map((item) => item.name),
    optional: OPTIONAL_COLUMNS.filter((name) => columns.has(name)),
  };
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

function isRequired(name: string): boolean {
  return REQUIRED_COLUMNS.some((column) => column === name);
}

function isOptional(name: string): boolean {
  return OPTIONAL_COLUMNS.some((column) => column === name);
}
