import type { CellLike, SheetLike } from '../../../../application/src/ports/workbook-reader.js';
import type { ParsedCell, ParsedPo } from '../../../../application/src/ports/parsed-rows.js';
import { cellIssue, isNotProvided, parseBarcode, parseItemCode, parsePoCell, type ImportIssue, type LocalDate, type Settings } from '@sw/domain';
import { parseDate } from '../../normalize/date.js';
import { parseQty } from '../../normalize/qty.js';
import type { HeaderMap } from './headers.js';

export type Field<T> = { readonly cell: ParsedCell<T>; readonly issues: readonly ImportIssue[] };

export type SheetReader = {
  text(input: { readonly row: number; readonly name: string; readonly occurrence?: number | undefined }): Field<string>;
  lot(row: number, name: string): Field<string>;
  date(row: number, name: string): Field<LocalDate>;
  qty(row: number, name: string): Field<number>;
  po(row: number, name: string): Field<ParsedPo>;
  code(row: number, name: string): Field<string>;
  barcode(row: number, name: string): Field<string>;
  extra(row: number, col: number): Field<string>;
};

type Located = {
  readonly sheet: SheetLike;
  readonly row: number;
  readonly col: number | null;
  readonly column: string;
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
  readonly flattenNewlines: boolean;
};

export function sheetReader(input: {
  readonly sheet: SheetLike;
  readonly header: HeaderMap;
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
}): SheetReader {
  const located = ({ row, name, options }: { readonly row: number; readonly name: string; readonly options?: { readonly occurrence?: number; readonly flattenNewlines?: boolean } | undefined }): Located => ({
    sheet: input.sheet,
    row,
    col: input.header.col(name, options?.occurrence),
    column: name,
    date1904: input.date1904,
    dateSanityRange: input.dateSanityRange,
    flattenNewlines: options?.flattenNewlines === true,
  });
  return {
    text: ({ row, name, occurrence }: { readonly row: number; readonly name: string; readonly occurrence: number | undefined }) => readText(located({ row, name, options: occurrence === undefined ? undefined : { occurrence } })),
    lot: (row, name) => readText(located({ row, name, options: { flattenNewlines: true } })),
    date: (row, name) => readDate(located({ row, name })),
    qty: (row, name) => readQty(located({ row, name })),
    po: (row, name) => readPo(located({ row, name })),
    code: (row, name) => readCoded(located({ row, name }), parseItemCode),
    barcode: (row, name) => readCoded(located({ row, name }), parseBarcode),
    extra: (row, col) => (input.header.used.has(col) ? blank() : readText({
      sheet: input.sheet,
      row,
      col,
      column: columnLetter(col),
      date1904: input.date1904,
      dateSanityRange: input.dateSanityRange,
      flattenNewlines: false,
    })),
  };
}

export function take<T>(issues: ImportIssue[], field: Field<T>): ParsedCell<T> {
  issues.push(...field.issues);
  return field.cell;
}

function readText(located: Located): Field<string> {
  const cell = at(located);
  const issues = mergedIssues(cell, located.column);
  if (cell === null || isNotProvided(cell.text)) return { cell: { raw: rawOf(cell), value: null }, issues };
  const value = located.flattenNewlines ? cell.text.replace(/\r?\n/g, ' ').trim() : cell.text.trim();
  return { cell: { raw: cell.text, value }, issues };
}

function readDate(located: Located): Field<LocalDate> {
  const cell = at(located);
  if (cell === null) return { cell: { raw: null, value: null }, issues: [] };
  const parsed = parseDate(cell, { date1904: located.date1904, dateSanityRange: located.dateSanityRange });
  return { cell: { raw: parsed.raw === '' ? null : parsed.raw, value: parsed.value }, issues: [...mergedIssues(cell, located.column), ...stamp(parsed.issues, located.column)] };
}

function readQty(located: Located): Field<number> {
  const cell = at(located);
  if (cell === null) return { cell: { raw: null, value: null }, issues: [] };
  const parsed = parseQty(cell);
  return { cell: { raw: parsed.raw === '' ? null : parsed.raw, value: parsed.value }, issues: [...mergedIssues(cell, located.column), ...stamp(parsed.issues, located.column)] };
}

function readPo(located: Located): Field<ParsedPo> {
  const cell = at(located);
  const issues = mergedIssues(cell, located.column);
  if (cell === null || cell.text.trim() === '') return { cell: { raw: null, value: null }, issues };
  const parsed = parsePoCell(cell.text);
  return {
    cell: { raw: cell.text, value: { poRaw: cell.text, poNorm: parsed.value.poNorm, poFormat: parsed.value.poFormat, relatedPoRaws: parsed.value.relatedPoRaws } },
    issues: [...issues, ...stamp(parsed.issues, located.column)],
  };
}

function readCoded(located: Located, parse: (text: string) => { readonly value: { readonly codeNorm: string } | string | null; readonly issues: readonly ImportIssue[] }): Field<string> {
  const cell = at(located);
  const issues = mergedIssues(cell, located.column);
  if (cell === null || cell.text.trim() === '') return { cell: { raw: null, value: null }, issues };
  const parsed = parse(cell.text);
  return { cell: { raw: cell.text, value: codeValue(parsed.value) }, issues: [...issues, ...stamp(parsed.issues, located.column)] };
}

function codeValue(value: { readonly codeNorm: string } | string | null): string | null {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  return value.codeNorm;
}

function at(located: Located): CellLike | null {
  if (located.col === null) return null;
  return located.sheet.cell(located.row, located.col);
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

function blank(): Field<string> {
  return { cell: { raw: null, value: null }, issues: [] };
}

function columnLetter(col: number): string {
  let n = col;
  let letters = '';
  while (n > 0) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}
