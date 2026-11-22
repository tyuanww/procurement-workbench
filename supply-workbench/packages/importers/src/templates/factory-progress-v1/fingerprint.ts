import { createHash } from 'node:crypto';
import type { ParsedCell, ParsedPo, ParsedRow } from '../../../../application/src/ports/parsed-rows.js';
import type { LocalDate } from '@sw/domain';

export type DraftRow<T> = Omit<ParsedRow<T>, 'fingerprint'> & { readonly base: string };

export function stampFingerprints<T>(rows: readonly DraftRow<T>[]): ParsedRow<T>[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const next = (seen.get(row.base) ?? 0) + 1;
    seen.set(row.base, next);
    const { base, ...rest } = row;
    return { ...rest, fingerprint: `${base}#${next}` };
  });
}

export function hashFields(sheetName: string, fields: readonly string[]): string {
  return createHash('sha1').update([sheetName, ...fields].join('\u001f')).digest('hex');
}

export function textField(cell: ParsedCell<string>): string {
  return cell.value ?? '';
}

export function numberField(cell: ParsedCell<number>): string {
  return cell.value === null ? '' : String(cell.value);
}

export function dateField(cell: ParsedCell<LocalDate>): string {
  return cell.value ?? '';
}

export function poField(cell: ParsedCell<ParsedPo>): string {
  const po = cell.value;
  if (po === null) return '';
  return [po.poNorm ?? '', po.poFormat, ...po.relatedPoRaws].join(',');
}
