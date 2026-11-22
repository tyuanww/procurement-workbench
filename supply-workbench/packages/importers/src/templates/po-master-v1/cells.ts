import type { CellLike, SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { ParsedCell, ParsedPo } from '../../../../application/src/ports/parsed-rows.js';
import { cellIssue, isNotProvided, parseBarcode, parsePoCell, type ImportIssue, type LocalDate, type Settings } from '@sw/domain';
import { parseDate } from '../../normalize/date.js';
import { parseQty } from '../../normalize/qty.js';
import { KNOWN_STATUS } from './columns.js';

export type Field<T> = { readonly cell: ParsedCell<T>; readonly issues: readonly ImportIssue[] };

type Slot = {
  readonly sheet: SheetLike;
  readonly row: number;
  readonly columns: ReadonlyMap<string, number>;
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
};

export function readText(slot: Slot, column: string): Field<string> {
  const cell = at(slot, column);
  const issues = mergedIssues(cell, column);
  if (cell === null || isNotProvided(cell.text)) return { cell: { raw: rawOf(cell), value: null }, issues };
  return { cell: { raw: cell.text, value: cell.text.trim() }, issues };
}

export function readDate(slot: Slot, column: string): Field<LocalDate> {
  const cell = at(slot, column);
  if (cell === null) return { cell: { raw: null, value: null }, issues: [] };
  const parsed = parseDate(cell, { date1904: slot.date1904, dateSanityRange: slot.dateSanityRange });
  return { cell: { raw: parsed.raw === '' ? null : parsed.raw, value: parsed.value }, issues: [...mergedIssues(cell, column), ...stamp(parsed.issues, column)] };
}

export function readQty(slot: Slot, column: string): Field<number> {
  const cell = at(slot, column);
  if (cell === null) return { cell: { raw: null, value: null }, issues: [] };
  const parsed = parseQty(cell);
  return { cell: { raw: parsed.raw === '' ? null : parsed.raw, value: parsed.value }, issues: [...mergedIssues(cell, column), ...stamp(parsed.issues, column)] };
}

export function readPo(slot: Slot, column: string): Field<ParsedPo> {
  const cell = at(slot, column);
  const issues = mergedIssues(cell, column);
  if (cell === null || cell.text.trim() === '') return { cell: { raw: null, value: null }, issues };
  const parsed = parsePoCell(cell.text);
  return {
    cell: { raw: cell.text, value: { poRaw: cell.text, poNorm: parsed.value.poNorm, poFormat: parsed.value.poFormat, relatedPoRaws: parsed.value.relatedPoRaws } },
    issues: [...issues, ...stamp(parsed.issues, column)],
  };
}

export function readBarcode(slot: Slot, column: string): Field<string> {
  const cell = at(slot, column);
  const issues = mergedIssues(cell, column);
  if (cell === null || cell.text.trim() === '') return { cell: { raw: null, value: null }, issues };
  const parsed = parseBarcode(cell.text);
  return { cell: { raw: cell.text, value: parsed.value }, issues: [...issues, ...stamp(parsed.issues, column)] };
}

export function readStatus(slot: Slot, column: string): Field<string> {
  const text = readText(slot, column);
  if (text.cell.value === null || KNOWN_STATUS.has(text.cell.value)) return text;
  return { cell: text.cell, issues: [...text.issues, cellIssue({ code: 'STATUS_UNKNOWN', raw: text.cell.raw, column })] };
}

function at(slot: Slot, column: string): CellLike | null {
  const col = slot.columns.get(column);
  if (col === undefined) return null;
  return slot.sheet.cell(slot.row, col);
}

function mergedIssues(cell: CellLike | null, column: string): ImportIssue[] {
  if (cell?.mergedFrom === undefined) return [];
  return [cellIssue({ code: 'MERGED_FILL', raw: cell.text, column })];
}

function stamp(issues: readonly ImportIssue[], column: string): ImportIssue[] {
  return issues.map((issue) => ({ ...issue, column }));
}

function rawOf(cell: CellLike | null): string | null {
  if (cell === null || cell.text === '') return null;
  return cell.text;
}
