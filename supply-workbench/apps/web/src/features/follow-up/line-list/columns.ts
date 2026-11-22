import { lineDeskColumns, lineStageLabel, type Lane, type LineDeskColumnKey, type MissingReason } from '@sw/domain';
import type { OrderLineRow } from '@sw/contracts';
import { formatQuantity, formatTableDate } from '../../../shared/ui/format.js';

const MISSING_MARK = '—';

export type LineCell =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string }
  | { readonly kind: 'missing'; readonly reason: MissingReason; readonly raw?: string };

type CellSpec = {
  readonly isLink: boolean;
  readonly cell: (row: OrderLineRow, now: Date) => LineCell;
};

const CELLS: Record<LineDeskColumnKey, CellSpec> = {
  po: { isLink: true, cell: poCell },
  name: { isLink: false, cell: nameCell },
  supplier: { isLink: false, cell: supplierCell },
  factory: { isLink: false, cell: factoryCell },
  receiver: { isLink: false, cell: receiverCell },
  qtyOrdered: { isLink: false, cell: orderedQtyCell },
  received: { isLink: false, cell: receivedQtyCell },
  factoryDelivered: { isLink: false, cell: deliveredCell },
  stage: { isLink: false, cell: stageCell },
  nextDue: { isLink: false, cell: nextDueCell },
  factoryRequired: { isLink: false, cell: factoryRequiredCell },
  daysInStage: { isLink: false, cell: daysCell },
  buyer: { isLink: false, cell: buyerCell },
  status: { isLink: false, cell: statusCell },
};

export type LineColumnKey = LineDeskColumnKey;

export type LineColumnView = {
  readonly key: LineColumnKey;
  readonly title: string;
};

export function columnsOf(lane: Lane): readonly LineColumnView[] {
  return lineDeskColumns(lane);
}

export function lineCell(input: { readonly column: LineColumnKey; readonly row: OrderLineRow; readonly now: Date }): LineCell {
  return linkedCell({ spec: CELLS[input.column], row: input.row, now: input.now });
}

function linkedCell(input: { readonly spec: CellSpec; readonly row: OrderLineRow; readonly now: Date }): LineCell {
  const body = input.spec.cell(input.row, input.now);
  if (!input.spec.isLink || body.kind !== 'text') return body;
  return { kind: 'link', text: body.text, href: `/lines/${input.row.id}` };
}

function poCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: row.po.poRaw ?? '无单号' };
}

function nameCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: row.nameRaw ?? '' };
}

function supplierCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: row.supplier.displayName ?? row.supplier.rawName ?? '' };
}

function factoryCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: row.factory?.displayName ?? '未关联' };
}

function receiverCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: row.receiver?.displayName ?? '' };
}

function orderedQtyCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: qtyText(row.qtyOrdered) };
}

function receivedQtyCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: qtyText(row.receivedQty) };
}

function qtyText(value: number | null): string {
  return formatQuantity(value);
}

function deliveredCell(row: OrderLineRow): LineCell {
  const delivered = row.factoryDeliveredQty;
  if (delivered.value !== null) return { kind: 'text', text: formatQuantity(delivered.value) };
  return missingDelivered(delivered);
}

function missingDelivered(delivered: OrderLineRow['factoryDeliveredQty']): LineCell {
  const reason = delivered.missingReason ?? 'no_matching_record';
  if (delivered.raw === undefined) return { kind: 'missing', reason };
  return { kind: 'missing', reason, raw: delivered.raw };
}

function stageCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: lineStageLabel(row.stage) };
}

function nextDueCell(row: OrderLineRow, now: Date): LineCell {
  return { kind: 'text', text: dueText({ due: row.nextDue, now }) };
}

function dueText(input: { readonly due: OrderLineRow['nextDue']; readonly now: Date }): string {
  if (input.due === null) return MISSING_MARK;
  return datedDue({ date: input.due.dateBuyerConfirmed, days: input.due.overdueDays, now: input.now });
}

function datedDue(input: { readonly date: string | null; readonly days: number | null; readonly now: Date }): string {
  if (!isPositiveDays(input.days)) return input.date === null ? MISSING_MARK : formatTableDate({ iso: input.date, now: input.now });
  if (input.date === null) return `逾期${input.days}`;
  return `${formatTableDate({ iso: input.date, now: input.now })} 逾期${input.days}`;
}

function isPositiveDays(days: number | null): days is number {
  return days !== null && Number.isFinite(days) && days > 0;
}

function factoryRequiredCell(row: OrderLineRow, now: Date): LineCell {
  const due = row.nextDue;
  if (due === null) return { kind: 'missing', reason: 'not_provided' };
  return factoryDateCell({ date: due.dateFactoryRequired, now });
}

function factoryDateCell(input: { readonly date: string | null; readonly now: Date }): LineCell {
  if (typeof input.date !== 'string' || input.date === '') return { kind: 'missing', reason: 'not_provided' };
  return { kind: 'text', text: formatTableDate({ iso: input.date, now: input.now }) };
}

function daysCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: String(row.daysInStage) };
}

function buyerCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: row.buyer?.name ?? '未分配' };
}

function statusCell(row: OrderLineRow): LineCell {
  return { kind: 'text', text: row.statusReported ?? '' };
}
