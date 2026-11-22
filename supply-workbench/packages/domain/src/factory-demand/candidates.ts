import { cellIssue } from '../identity/issue.js';
import { parsePoCell } from '../identity/po.js';
import type { ImportIssue } from '../entities/records.js';
import type { PoFormat } from '../vocabulary/identity.js';
import type { LocalDate } from '../values/local-date.js';

export type DemandSlotInput = {
  readonly index: number;
  readonly date: LocalDate | null;
  readonly qty: number | null;
};

export type DemandCandidateRow = {
  readonly rowId: string;
  readonly blockMaterialPoRaw: string | null;
  readonly itemCodeRaw: string | null;
  readonly slots: readonly DemandSlotInput[];
};

export type BatchCandidate = {
  readonly blockMaterialPoRaw: string | null;
  readonly itemCodeRaw: string | null;
  readonly rowId: string;
  readonly slotIndex: number;
  readonly date: LocalDate;
  readonly qty: number;
};

const RECOGNIZED_PO = new Set<PoFormat>(['PO14', 'PO10', 'P0_10', 'P0_14', 'HZSY', 'SY', 'PUR3500', 'PUR3505']);

export type DemandOrderBlock = {
  readonly poRaw: string | null;
  readonly blockLabelRaw: string | null;
  readonly issues: readonly ImportIssue[];
};

/** 订单号格不是可识别单号时，文字是块标签，不是未知单号。 */
export function classifyDemandOrder(raw: string): DemandOrderBlock {
  const order = raw.trim();
  if (order === '') return { poRaw: null, blockLabelRaw: null, issues: [] };
  const parsed = parsePoCell(order);
  if (RECOGNIZED_PO.has(parsed.value.poFormat)) {
    return { poRaw: order, blockLabelRaw: null, issues: parsed.issues.map((issue) => ({ ...issue, column: '订单号' })) };
  }
  return { poRaw: null, blockLabelRaw: order, issues: [cellIssue({ code: 'PO_PLACEHOLDER', raw: order, column: '订单号' })] };
}
export function generateBatchCandidates(rows: readonly DemandCandidateRow[]): BatchCandidate[] {
  return rows.flatMap((row) => candidatesOf(row));
}

function candidatesOf(row: DemandCandidateRow): BatchCandidate[] {
  return row.slots.filter(hasDateAndQty).map((slot) => ({
    blockMaterialPoRaw: row.blockMaterialPoRaw,
    itemCodeRaw: row.itemCodeRaw,
    rowId: row.rowId,
    slotIndex: slot.index,
    date: slot.date,
    qty: slot.qty,
  }));
}

function hasDateAndQty(slot: DemandSlotInput): slot is DemandSlotInput & { readonly date: LocalDate; readonly qty: number } {
  return slot.date !== null && slot.qty !== null;
}
