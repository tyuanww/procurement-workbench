import { parseLocalDate, PO_FORMATS, type LocalDate, type PoFormat } from '@sw/domain';
import type { ParsedCell, ParsedPo } from '../../ports/parsed-rows.js';

export function isTextCell(value: unknown): value is ParsedCell<string> {
  return isCell(value, isTextValue);
}

export function isNumberCell(value: unknown): value is ParsedCell<number> {
  return isCell(value, isNumberValue);
}

export function isDateCell(value: unknown): value is ParsedCell<LocalDate> {
  return isCell(value, isDateValue);
}

export function isPoCell(value: unknown): value is ParsedCell<ParsedPo> {
  return isCell(value, isPoValue);
}

function isCell<T>(value: unknown, accept: (item: unknown) => item is T | null): value is ParsedCell<T> {
  if (!isRecord(value) || !('raw' in value) || !('value' in value)) return false;
  if (value.raw !== null && typeof value.raw !== 'string') return false;
  return accept(value.value);
}

function isTextValue(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNumberValue(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

function isDateValue(value: unknown): value is LocalDate | null {
  if (value === null) return true;
  return typeof value === 'string' && parseLocalDate(value).ok;
}

function isPoValue(value: unknown): value is ParsedPo | null {
  return value === null || isParsedPo(value);
}

function isParsedPo(value: unknown): value is ParsedPo {
  if (!isRecord(value) || typeof value.poFormat !== 'string' || !isPoFormat(value.poFormat)) return false;
  if (!isTextValue(value.poRaw) || !isTextValue(value.poNorm)) return false;
  return Array.isArray(value.relatedPoRaws) && value.relatedPoRaws.every((item) => typeof item === 'string');
}

function isPoFormat(value: string): value is PoFormat {
  return PO_FORMATS.some((format) => format === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
