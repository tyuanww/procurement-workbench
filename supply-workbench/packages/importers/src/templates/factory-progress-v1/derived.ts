import { cellIssue, derivedZeroValue, isDerivedNegative, type ImportIssue } from '@sw/domain';
import type { InTransitPayload, ParsedCell } from '../../../../application/src/ports/parsed-rows.js';
import type { DraftRow } from './fingerprint.js';
import { rehashTransit } from './parsers/in-transit.js';

const DELIVERED = '已交货数量';
const STOCK = '工厂现货库存数量';

export function applyDerivedZero({ rows, shipments, stock }: { readonly rows: readonly DraftRow<InTransitPayload>[]; readonly shipments: readonly { readonly payload: { readonly po: ParsedCell<{ readonly poNorm: string | null }>; readonly itemCodeRaw: ParsedCell<string> }; readonly skipReason: string | null }[]; readonly stock: readonly { readonly payload: { readonly po: ParsedCell<{ readonly poNorm: string | null }>; readonly itemCodeRaw: ParsedCell<string> }; readonly skipReason: string | null }[] }): DraftRow<InTransitPayload>[] {
  const shipped = pairSet(shipments);
  const stocked = pairSet(stock);
  return rows.map((row) => adjust({ row, shipped, stocked }));
}

function adjust({ row, shipped, stocked }: { readonly row: DraftRow<InTransitPayload>; readonly shipped: ReadonlySet<string>; readonly stocked: ReadonlySet<string> }): DraftRow<InTransitPayload> {
  if (row.skipReason !== null) return row;
  const key = pairKey(row.payload.po.value?.poNorm ?? null, row.payload.itemCodeRaw.value);
  const issues = [...row.issues];
  const qtyDeliveredFactory = clearZero({ cell: row.payload.qtyDeliveredFactory, column: DELIVERED, hasSource: shipped.has(key), issues });
  const qtyFactoryStock = clearZero({ cell: row.payload.qtyFactoryStock, column: STOCK, hasSource: stocked.has(key), issues });
  noteNegative(row.payload.qtyUnproduced.value, issues);
  return rehashTransit({ ...row, issues, payload: { ...row.payload, qtyDeliveredFactory, qtyFactoryStock } });
}

function clearZero(input: { readonly cell: ParsedCell<number>; readonly column: string; readonly hasSource: boolean; readonly issues: ImportIssue[] }): ParsedCell<number> {
  const value = derivedZeroValue(input.cell.value, input.hasSource);
  if (value === input.cell.value) return input.cell;
  input.issues.push(cellIssue({ code: 'DERIVED_ZERO_NO_SOURCE', raw: input.cell.raw, column: input.column }));
  return { raw: input.cell.raw, value };
}

function noteNegative(qty: number | null, issues: ImportIssue[]): void {
  if (!isDerivedNegative(qty)) return;
  issues.push(cellIssue({ code: 'DERIVED_NEGATIVE', raw: String(qty), column: '未生产数量' }));
}

function pairSet(rows: readonly { readonly payload: { readonly po: ParsedCell<{ readonly poNorm: string | null }>; readonly itemCodeRaw: ParsedCell<string> }; readonly skipReason: string | null }[]): Set<string> {
  const keys = new Set<string>();
  for (const row of rows) {
    if (row.skipReason !== null) continue;
    keys.add(pairKey(row.payload.po.value?.poNorm ?? null, row.payload.itemCodeRaw.value));
  }
  return keys;
}

function pairKey(poNorm: string | null, itemCode: string | null): string {
  return `${poNorm ?? ''}\u001f${itemCode ?? ''}`;
}
