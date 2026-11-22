import type { FactoryReportRowView } from '@sw/contracts';

type PoCell = { readonly raw: string | null; readonly value: { readonly poRaw: string | null } | null };
type TextCell = { readonly raw: string | null; readonly value: string | null };

export function unlinkedRowText(row: FactoryReportRowView): string {
  const place = `${row.sheetName} 第 ${row.rowNo} 行`;
  const reason = row.linkReason ?? '';
  if (row.kind !== 'schedule') return join(place, reason);
  return join(place, `${row.payload.day} · ${qtyText(row.payload.qty)} · ${poText(row.payload.po)} · ${itemText(row.payload.itemCodeRaw)}`, reason);
}

function qtyText(qty: number | null): string {
  return qty === null ? '数量未填' : String(qty);
}

function poText(po: PoCell): string {
  const raw = po.value?.poRaw ?? po.raw;
  if (raw === null || raw === '') return '无单号';
  return raw;
}

function itemText(cell: TextCell): string {
  const raw = cell.value ?? cell.raw;
  if (raw === null || raw === '') return '无品号';
  return raw;
}

function join(...parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(' ');
}
