import { daysInMonth } from './values/calendar.js';
import { localDate, type LocalDate } from './values/local-date.js';

// 公历推算 unavoidable 用到月长和星期。数字规则和 calendar.ts 一样，不在这里另禁。
/* eslint-disable no-magic-numbers */

const PAD = 2;
const DAYS_PER_WEEK = 7;
const EPOCH_MONDAY = localDate('2024-01-01');

const MIN_SERIAL = 1;
const MAX_YEAR = 9999;
const MONTHS_IN_YEAR = 12;

export function businessDay(instant: string, timeZone: string): LocalDate {
  const parsed = Date.parse(instant);
  if (!Number.isFinite(parsed)) throw new Error('业务日无法从时区算出');
  const parts = zonedParts(parsed, timeZone);
  const year = part(parts, 'year');
  const month = part(parts, 'month');
  const day = part(parts, 'day');
  return localDate(`${year}-${month.padStart(PAD, '0')}-${day.padStart(PAD, '0')}`);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  if (!Number.isInteger(days)) throw new Error('天数必须是整数');
  return fromSerial(toSerial(date) + days);
}

export function diffDays(later: LocalDate, earlier: LocalDate): number {
  return toSerial(later) - toSerial(earlier);
}

export function compareDates(left: LocalDate, right: LocalDate): -1 | 0 | 1 {
  const difference = diffDays(left, right);
  if (difference < 0) return -1;
  if (difference > 0) return 1;
  return 0;
}

export function weekStart(date: LocalDate): LocalDate {
  const sinceMonday = mod(diffDays(date, EPOCH_MONDAY), DAYS_PER_WEEK);
  return addDays(date, -sinceMonday);
}

const ONE_MONTH = -1;

export function recentMonth(today: LocalDate): { readonly from: LocalDate; readonly to: LocalDate } {
  return { from: localDate(shiftMonths(today, ONE_MONTH)), to: today };
}

function shiftMonths(day: LocalDate, months: number): string {
  const [yearText, monthText, dateText] = day.split('-');
  if (yearText === undefined || monthText === undefined || dateText === undefined) return day;
  const cursor = new Date(Date.UTC(Number(yearText), Number(monthText) - 1 + months, Number(dateText)));
  const monthOut = String(cursor.getUTCMonth() + 1).padStart(PAD, '0');
  const dateOut = String(cursor.getUTCDate()).padStart(PAD, '0');
  return `${cursor.getUTCFullYear()}-${monthOut}-${dateOut}`;
}

function zonedParts(instant: number, timeZone: string): Intl.DateTimeFormatPart[] {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(instant));
  } catch (error) {
    if (error instanceof RangeError) throw new Error('业务日无法从时区算出', { cause: error });
    throw error;
  }
}
function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const found = parts.find((item) => item.type === type)?.value;
  if (found === undefined) throw new Error('业务日无法从时区算出');
  return found;
}

function toSerial(date: LocalDate): number {
  const [yearText, monthText, dayText] = date.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (year < 1) throw new Error('业务日超出范围');
  let serial = day;
  for (let cursor = 1; cursor < month; cursor += 1) serial += daysInMonth(year, cursor);
  for (let cursor = 1; cursor < year; cursor += 1) serial += daysInYear(cursor);
  return serial;
}

function fromSerial(serial: number): LocalDate {
  if (!Number.isSafeInteger(serial) || serial < MIN_SERIAL) throw new Error('业务日超出范围');
  let year = 1;
  let remaining = serial;
  while (remaining > daysInYear(year)) {
    if (year >= MAX_YEAR) throw new Error('业务日超出范围');
    remaining -= daysInYear(year);
    year += 1;
  }
  let month = 1;
  while (remaining > daysInMonth(year, month)) {
    if (month >= MONTHS_IN_YEAR) throw new Error('业务日超出范围');
    remaining -= daysInMonth(year, month);
    month += 1;
  }
  return localDate(`${pad(year, 4)}-${pad(month, PAD)}-${pad(remaining, PAD)}`);
}

function daysInYear(year: number): number {
  return daysInMonth(year, 2) === 29 ? 366 : 365;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
