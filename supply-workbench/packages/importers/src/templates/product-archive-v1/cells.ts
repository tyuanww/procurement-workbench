import type { CellLike, SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { ParsedCell } from '../../../../application/src/ports/parsed-rows.js';
import { isNotProvided, parseBarcode, type ImportIssue } from '@sw/domain';

export type Field<T> = { readonly cell: ParsedCell<T>; readonly issues: readonly ImportIssue[] };

type Slot = { readonly sheet: SheetLike; readonly row: number; readonly columns: ReadonlyMap<string, number> };

export function readText(slot: Slot, column: string): Field<string> {
  const cell = at(slot, column);
  if (cell === null || isNotProvided(cell.text)) return { cell: { raw: rawOf(cell), value: null }, issues: [] };
  return { cell: { raw: cell.text, value: cell.text.trim() }, issues: [] };
}

export function readBarcode(slot: Slot, column: string): Field<string> {
  const cell = at(slot, column);
  if (cell === null || cell.text.trim() === '') return { cell: { raw: null, value: null }, issues: [] };
  const parsed = parseBarcode(cell.text);
  return { cell: { raw: cell.text, value: parsed.value }, issues: stamp(parsed.issues, column) };
}

function at(slot: Slot, column: string): CellLike | null {
  const col = slot.columns.get(column);
  if (col === undefined) return null;
  return slot.sheet.cell(slot.row, col);
}

function stamp(issues: readonly ImportIssue[], column: string): ImportIssue[] {
  return issues.map((issue) => ({ ...issue, column }));
}

function rawOf(cell: CellLike | null): string | null {
  if (cell === null || cell.text === '') return null;
  return cell.text;
}
