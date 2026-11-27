import * as XLSX from 'xlsx';
import type { WorkBook, WorkSheet } from 'xlsx';
import type { WorkbookLike } from '../../../application/src/ports/workbook-reader.js';
import { buildSheet, cellKey, type CellDraft, type MergeRange } from './sheet.js';
import { decodeXml } from './zip-xml.js';

export function readSheetJs({ bytes, xml, captureCalendarDates }: {
  readonly bytes: Uint8Array; readonly xml: WorkbookLike; readonly captureCalendarDates: boolean;
}): WorkbookLike {
  const book: WorkBook = XLSX.read(bytes, { type: 'array', cellFormula: true, cellDates: false, cellNF: captureCalendarDates });
  return {
    source: xml.source,
    date1904: book.Workbook?.WBProps?.date1904 === true,
    sheets: book.SheetNames.map((name, index) => sheetOf({ book, name, index, xml: xml.sheets[index], captureCalendarDates })),
  };
}

function sheetOf(input: { readonly book: WorkBook; readonly name: string; readonly index: number; readonly xml: WorkbookLike['sheets'][number] | undefined; readonly captureCalendarDates: boolean }): ReturnType<typeof buildSheet> {
  const sheet = input.book.Sheets[input.name];
  if (sheet === undefined) throw new Error('Excel 文件打不开');
  const { hiddenRows, images } = input.xml ?? {};
  return buildSheet({
    name: input.name,
    hidden: (input.book.Workbook?.Sheets?.[input.index]?.Hidden ?? 0) > 0,
    ...(hiddenRows === undefined ? {} : { hiddenRows }),
    cells: cellsOf(sheet, input.captureCalendarDates),
    merges: mergesOf(sheet),
    ...(images === undefined ? {} : { images }),
  });
}

function cellsOf(sheet: WorkSheet, captureCalendarDates: boolean): Map<string, CellDraft> {
  const cells = new Map<string, CellDraft>();
  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!')) continue;
    const cell = sheet[key];
    if (!isCell(cell)) continue;
    const address = XLSX.utils.decode_cell(key);
    cells.set(cellKey(address.r + 1, address.c + 1), draftOf(cell, captureCalendarDates));
  }
  return cells;
}

function draftOf(cell: Record<string, unknown>, captureCalendarDates: boolean): CellDraft {
  const kind = kindOf(cell.t);
  const formula = typeof cell.f === 'string' ? cell.f : undefined;
  const text = textOf(kind, cell.v);
  const richText = kind === 'string' && text === '' && formula === undefined ? richTextOf(cell.r) : undefined;
  return {
    kind,
    value: storedValue(cell.v),
    text,
    ...numericMetadata({ kind, cell, text, captureCalendarDates }),
    ...(formula === undefined ? {} : { formula }),
    ...(richText === undefined ? {} : { richText }),
  };
}

function numericMetadata({ kind, cell, text, captureCalendarDates }: {
  readonly kind: CellDraft['kind']; readonly cell: Record<string, unknown>; readonly text: string; readonly captureCalendarDates: boolean;
}): Pick<CellDraft, 'displayText' | 'calendarDateFormatted'> {
  if (kind !== 'number') return {};
  return {
    ...(typeof cell.w === 'string' && cell.w !== text ? { displayText: cell.w } : {}),
    ...(captureCalendarDates && isCalendarDateFormat(cell.z) ? { calendarDateFormatted: true } : {}),
  };
}

function isCalendarDateFormat(format: unknown): boolean {
  if (typeof format !== 'string' || XLSX.SSF.is_date(format) !== true) return false;
  const tokens = format.split(';')[0]?.replace(/"(?:[^"]|"")*"|(?:\\|_|\*).|\[[^\]]*\]/gu, '') ?? '';
  return /[yd]/iu.test(tokens);
}

function richTextOf(xml: unknown): string | undefined {
  if (typeof xml !== 'string') return undefined;
  try {
    const runs = xml.matchAll(/<(?:\w+:)?r>([\s\S]*?)<\/(?:\w+:)?r>/gu);
    let text = '';
    for (const [, run] of runs) {
      const part = /<(?:\w+:)?t\b[^<>]*>([^<]*)<\/(?:\w+:)?t>/u.exec(run ?? '')?.[1];
      if (part !== undefined) text += decodeXml(part);
    }
    return text === '' ? undefined : text;
  } catch {
    return undefined;
  }
}

function storedValue(value: unknown): CellDraft['value'] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

function kindOf(type: unknown): CellDraft['kind'] {
  if (type === 's' || type === 'str') return 'string';
  if (type === 'b') return 'bool';
  if (type === 'e') return 'error';
  if (type === 'n') return 'number';
  return 'empty';
}

function textOf(kind: CellDraft['kind'], value: unknown): string {
  if (value === undefined || value === null || kind === 'empty' || value instanceof Date) return '';
  if (kind === 'bool') return value === true ? 'TRUE' : 'FALSE';
  return String(value);
}

function isCell(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergesOf(sheet: WorkSheet): MergeRange[] {
  return (sheet['!merges'] ?? []).map((merge) => ({ r1: merge.s.r + 1, c1: merge.s.c + 1, r2: merge.e.r + 1, c2: merge.e.c + 1 }));
}
