import { businessTimeZone } from '../business-time-zone.js';

const MISSING = '—';

export type DateParts = {
  readonly year: string;
  readonly month: string;
  readonly day: string;
};

export type ClockParts = DateParts & {
  readonly hour: string;
  readonly minute: string;
};

export function formatTableDate(input: { readonly iso: string | null; readonly now: Date; readonly timeZone?: string }): string {
  if (input.iso === null) return MISSING;
  const parts = dateParts(input.iso, input.timeZone ?? businessTimeZone());
  if (parts === null) return MISSING;
  if (parts.year === yearOf(input.now, input.timeZone ?? businessTimeZone())) return `${parts.month}-${parts.day}`;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDateTime(iso: string | null, timeZone = businessTimeZone()): string | null {
  const parts = clockPartsOf(iso, timeZone);
  if (parts === null) return null;
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function formatQuantity(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return MISSING;
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 }).format(value);
}

export function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return MISSING;
  return `¥${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}

function dateParts(iso: string, timeZone: string): DateParts | null {
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (plain !== null) return { year: required(plain[1]), month: required(plain[2]), day: required(plain[3]) };
  const parts = clockPartsOf(iso, timeZone);
  if (parts === null) return null;
  return { year: parts.year, month: parts.month, day: parts.day };
}

function clockPartsOf(iso: string | null, timeZone: string): ClockParts | null {
  if (iso === null) return null;
  if (!hasZone(iso)) return null;
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return null;
  return clockParts(parsed, timeZone);
}

function hasZone(iso: string): boolean {
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso);
}

function yearOf(instant: Date, timeZone: string): string | null {
  const parts = partsOf(instant, timeZone);
  return parts === null ? null : part(parts, 'year') ?? null;
}

function clockParts(parsed: number, timeZone: string): ClockParts | null {
  const parts = partsOf(new Date(parsed), timeZone);
  if (parts === null) return null;
  const year = part(parts, 'year');
  const month = part(parts, 'month');
  const day = part(parts, 'day');
  const hour = part(parts, 'hour');
  const minute = part(parts, 'minute');
  if (year === undefined || month === undefined || day === undefined || hour === undefined || minute === undefined) return null;
  return { year, month, day, hour, minute };
}

function partsOf(instant: Date, timeZone: string): Intl.DateTimeFormatPart[] | null {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(instant);
  } catch {
    return null;
  }
}

function part(parts: readonly Intl.DateTimeFormatPart[], type: string): string | undefined {
  const found = parts.find((item) => item.type === type);
  return found === undefined || found.value === '' ? undefined : found.value;
}

function required(value: string | undefined): string {
  if (value === undefined) throw new Error('日期格式不完整');
  return value;
}
