import { DomainRuleViolation } from '../errors.js';
import type { DeliveryBatch, OrderLine } from '../entities/orders.js';
import type { EntityId } from '../values/ids.js';
import { assertWritable } from '../ownership/fields.js';
import { projectLine } from './stage.js';

export type LinePatch = {
  readonly buyerUserId?: EntityId | null;
  readonly receiverPartyId?: EntityId | null;
  readonly nameRaw?: string;
  readonly qtyOrdered?: number | null;
  readonly unit?: string | null;
  readonly itemCodeRaw?: string | null;
  readonly barcodeRaw?: string | null;
};

export function updateLine({ line, patch, at }: { readonly line: OrderLine; readonly patch: LinePatch; readonly at: string }): OrderLine {
  assertActive(line);
  const changed = changedFields(line, patch);
  assertWritable({ entity: 'order_line', fields: changed, origin: line.origin });
  if (patch.qtyOrdered !== undefined && patch.qtyOrdered !== null) assertPositive(patch.qtyOrdered);
  return { ...line, ...patch, updatedAt: at };
}

export function assignBuyer({ line, buyerUserId, at }: { readonly line: OrderLine; readonly buyerUserId: EntityId | null; readonly at: string }): OrderLine {
  assertActive(line);
  return { ...line, buyerUserId, updatedAt: at };
}

export function cancelLine(line: OrderLine, input: { readonly reason: string; readonly at: string }): OrderLine {
  assertReason(input.reason);
  if (line.cancelledAt !== null) throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '订单行已经取消', details: { state: line.stage } });
  const projection = projectLine({ ...line, cancelledAt: input.at }, []);
  return { ...line, ...projection, cancelledAt: input.at, cancelReason: input.reason.trim(), updatedAt: input.at };
}

export function reopenLine({ line, batches, input }: { readonly line: OrderLine; readonly batches: readonly DeliveryBatch[]; readonly input: { readonly reason: string; readonly at: string } }): OrderLine {
  assertReason(input.reason);
  if (line.cancelledAt === null) throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '订单行没有取消', details: { state: line.stage } });
  const cleared = { ...line, cancelledAt: null, cancelReason: null, updatedAt: input.at };
  return { ...cleared, ...projectLine(cleared, batches) };
}

function assertActive(line: OrderLine): void {
  if (line.cancelledAt !== null) throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '取消的订单行不能改', details: { state: line.stage } });
}

function assertReason(reason: string): void {
  if (reason.trim() === '') throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '必须写原因', details: { state: 'reason' } });
}

function assertPositive(qty: number): void {
  if (!Number.isFinite(qty) || qty <= 0) throw new DomainRuleViolation({ code: 'STATE_CONFLICT', message: '数量必须大于 0', details: { state: 'qty' } });
}

const PATCH_KEYS = ['buyerUserId', 'receiverPartyId', 'nameRaw', 'qtyOrdered', 'unit', 'itemCodeRaw', 'barcodeRaw'] as const;

function changedFields(line: OrderLine, patch: LinePatch): string[] {
  return PATCH_KEYS.filter((key) => patch[key] !== undefined && patch[key] !== line[key]);
}
