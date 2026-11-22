import type { CellLike } from '../../../application/src/ports/workbook-reader.js';
import {
  cellIssue,
  compareDates,
  isNotProvided,
  parseLocalDate,
  parsedCell,
  unparsedCell,
  type IssueCode,
  type LocalDate,
  type CellParse,
  type Settings,
} from '@sw/domain';
import { excelSerialToLocalDate } from '../workbook/excel-date.js';
import { cellRaw, isFormulaError } from './tokens.js';

export type DateParseOptions = {
  readonly date1904: boolean;
  readonly dateSanityRange: Settings['dateSanityRange'];
};

type TextDate =
  | { readonly kind: 'date'; readonly value: LocalDate }
  | { readonly kind: 'no-year' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'text' };

const MONTH_MAX_DAY = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function parseDate(cell: CellLike, options: DateParseOptions): CellParse<LocalDate | null> {
  if (cell.kind === 'error' || isFormulaError(cell.text)) return rejected(cell, 'FORMULA_ERROR');
  if (cell.kind === 'number') return numberDate(cell, options);
  if (cell.kind === 'empty' || isNotProvided(cell.text)) return blank(cell);
  return textDate(cell, options);
}

function numberDate(cell: CellLike, options: DateParseOptions): CellParse<LocalDate | null> {
  const serial = typeof cell.value === 'number' ? cell.value : Number.NaN;
  const date = serialDate(serial, options.date1904);
  if (date === null) return rejected(cell, 'DATE_INVALID');
  if (!isInside(date, options.dateSanityRange)) return rejected(cell, 'DATE_OUT_OF_RANGE');
  return accepted(cell, date);
}

function textDate(cell: CellLike, options: DateParseOptions): CellParse<LocalDate | null> {
  const read = readTextDate(cell.text.normalize('NFKC').trim());
  if (read.kind === 'date' && !isInside(read.value, options.dateSanityRange)) return rejected(cell, 'DATE_OUT_OF_RANGE');
  if (read.kind === 'date') return accepted(cell, read.value);
  if (read.kind === 'no-year') return rejected(cell, 'DATE_NO_YEAR');
  if (read.kind === 'invalid') return rejected(cell, 'DATE_INVALID');
  return rejected(cell, 'DATE_TEXT');
}

function readTextDate(text: string): TextDate {
  const separated = matchSeparated(text);
  if (separated !== null) return separated;
  const compact = matchCompact(text);
  if (compact !== null) return compact;
  const monthDay = matchMonthDay(text);
  if (monthDay !== null) return monthDay;
  // 「预计9/10」「6月份」是整格文字。整格都由数字和日期分隔符组成，才算残缺日期。
  if (isDateShaped(text)) return { kind: 'invalid' };
  return { kind: 'text' };
}

function matchSeparated(text: string): TextDate | null {
  const matched = /^(\d{4})([/.-])(\d{1,2})\2(\d{1,2})$/.exec(text);
  if (matched === null) return null;
  return toDate({ year: matched[1], month: matched[3], day: matched[4] });
}

function matchCompact(text: string): TextDate | null {
  const matched = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (matched === null) return null;
  return toDate({ year: matched[1], month: matched[2], day: matched[3] });
}

function matchMonthDay(text: string): TextDate | null {
  const matched = /^(\d{1,2})月(\d{1,2})日$/.exec(text);
  if (matched === null) return null;
  const month = Number(matched[1]);
  const day = Number(matched[2]);
  const maxDay = MONTH_MAX_DAY[month];
  if (maxDay === undefined || !Number.isInteger(day) || day < 1 || day > maxDay) return { kind: 'invalid' };
  // 补年是导入批次的决定，单元格解析不猜年份。
  return { kind: 'no-year' };
}

function toDate({ year, month, day }: { readonly year: string | undefined; readonly month: string | undefined; readonly day: string | undefined }): TextDate {
  if (year === undefined || month === undefined || day === undefined) return { kind: 'invalid' };
  if (!Number.isInteger(Number(year)) || Number(year) < 1) return { kind: 'invalid' };
  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = parseLocalDate(iso);
  if (!parsed.ok) return { kind: 'invalid' };
  return { kind: 'date', value: parsed.value };
}

function isDateShaped(text: string): boolean {
  return text !== '' && /^[\d./\-年月日]+$/u.test(text);
}

function serialDate(serial: number, isDate1904: boolean): LocalDate | null {
  if (!Number.isFinite(serial)) return null;
  const whole = Math.trunc(serial);
  if (!Number.isSafeInteger(whole) || whole < 1) return null;
  try {
    return excelSerialToLocalDate(whole, isDate1904);
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}

function isInside(date: LocalDate, range: DateParseOptions['dateSanityRange']): boolean {
  return compareDates(date, range.from) >= 0 && compareDates(range.to, date) >= 0;
}

function accepted(cell: CellLike, value: LocalDate): CellParse<LocalDate> {
  const issues = cell.formula === undefined ? [] : [cellIssue({ code: 'FORMULA_VALUE', raw: cellRaw(cell) })];
  return parsedCell({ value, raw: cellRaw(cell), issues });
}

function rejected(cell: CellLike, code: IssueCode): CellParse<null> {
  return unparsedCell(cellRaw(cell), [cellIssue({ code, raw: cellRaw(cell) })]);
}

function blank(cell: CellLike): CellParse<null> {
  return parsedCell({ value: null, raw: cellRaw(cell), issues: [], missingReason: 'not_provided' });
}
