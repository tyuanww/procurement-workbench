import { MONTH_LENGTHS, daysInMonth } from './calendar.js';

const localDateBrand: unique symbol = Symbol('LocalDate');

export type LocalDate = string & { readonly [localDateBrand]: 'LocalDate' };

export type ParseLocalDateResult =
  | { readonly ok: true; readonly value: LocalDate }
  | { readonly ok: false; readonly reason: 'format' | 'not_a_date' };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseLocalDate(input: string): ParseLocalDateResult {
  const parts = dateParts(input);
  if (parts === null) return { ok: false, reason: 'format' };
  if (!isRealDate({ year: parts.year, month: parts.month, day: parts.day })) return { ok: false, reason: 'not_a_date' };
  if (!isLocalDate(input)) return { ok: false, reason: 'not_a_date' };
  return { ok: true, value: input };
}

export function isLocalDate(input: string): input is LocalDate {
  const parts = dateParts(input);
  if (parts === null) return false;
  return isRealDate({ year: parts.year, month: parts.month, day: parts.day });
}

function dateParts(input: string): { readonly year: number; readonly month: number; readonly day: number } | null {
  const matched = ISO_DATE.exec(input);
  if (matched === null) return null;
  const yearText = matched[1];
  const monthText = matched[2];
  const dayText = matched[3];
  if (yearText === undefined || monthText === undefined || dayText === undefined) return null;
  return { year: Number(yearText), month: Number(monthText), day: Number(dayText) };
}

export function localDate(input: string): LocalDate {
  const parsed = parseLocalDate(input);
  if (!parsed.ok) throw new Error(`不是合法业务日: ${input}`);
  return parsed.value;
}

function isRealDate({ year, month, day }: { readonly year: number; readonly month: number; readonly day: number }): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > MONTH_LENGTHS.length - 1) return false;
  if (day < 1) return false;
  return day <= daysInMonth(year, month);
}
