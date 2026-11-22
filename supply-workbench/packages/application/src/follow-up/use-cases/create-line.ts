import type { EntityId, OrderLine, OrderLineId, PurchaseOrder } from '@sw/domain';
import type { CreateLine, CreateLineDeps } from '../boundary.js';
import type { CreateLineInput } from '../views.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { recordManualOwner, requireOwnerAccount } from '../../shared/owner-assignment.js';
import { ValidationFailedError } from '../../shared/errors.js';

export const makeCreateLine =
  (deps: CreateLineDeps): CreateLine =>
  async (input, actor) => {
    authorize(actor, 'lines.write');
    const name = requiredText(input.nameRaw, 'nameRaw');
    assertQty(input.qtyOrdered);
    const at = deps.clock.now();
    const lineId = deps.ids.orderLine();
    const purchaseOrderId = deps.ids.next();
    await deps.uow.run(async (tx) => {
      const owner = input.buyerUserId === undefined ? null : await requireOwnerAccount(tx.users, input.buyerUserId);
      await tx.purchaseOrders.save(purchaseOrder({ id: purchaseOrderId, input, at }));
      const line = orderLine({ id: lineId, purchaseOrderId, name, input, at });
      await tx.orderLines.save(line);
      if (owner !== null) await recordManualOwner({ tx, at, line, owner, nextId: () => deps.ids.next() });
      await tx.audit.record(auditOf({ action: 'line.create', subject: line, ctx: { actor, at, entity: '订单行' } }));
    });
    return { lineId };
  };

function purchaseOrder({ id, input, at }: { readonly id: EntityId; readonly input: CreateLineInput; readonly at: string }): PurchaseOrder {
  const poRaw = input.poRaw?.trim() ?? '';
  return {
    id,
    createdAt: at,
    updatedAt: at,
    poRaw: poRaw === '' ? null : poRaw,
    poNorm: poRaw === '' ? null : poRaw,
    poFormat: poRaw === '' ? 'NONE' : 'OTHER',
    relatedPoRaws: [],
    supplierPartyId: input.supplierPartyId ?? null,
    supplierRaw: null,
    lane: input.lane,
    oaDemandRef: null,
  };
}

function orderLine(input: { readonly id: OrderLineId; readonly purchaseOrderId: EntityId; readonly name: string; readonly input: CreateLineInput; readonly at: string }): OrderLine {
  return {
    id: input.id,
    createdAt: input.at,
    updatedAt: input.at,
    purchaseOrderId: input.purchaseOrderId,
    lane: input.input.lane,
    itemId: null,
    itemCodeRaw: input.input.itemCodeRaw ?? null,
    barcodeRaw: input.input.barcodeRaw ?? null,
    nameRaw: input.name,
    qtyOrdered: input.input.qtyOrdered,
    unit: input.input.unit ?? null,
    buyerUserId: input.input.buyerUserId ?? null,
    receiverPartyId: input.input.receiverPartyId,
    origin: 'manual',
    currentSnapshotId: null,
    candidateKey: null,
    missingInLatestImport: false,
    cancelledAt: null,
    cancelReason: null,
    stage: 'no_batch',
    stageChangedAt: input.at,
    nextDueBatchId: null,
    nextDueDate: null,
  };
}

function requiredText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed === '') throw new ValidationFailedError('不能为空', { field });
  return trimmed;
}

function assertQty(qty: number): void {
  if (!Number.isFinite(qty) || qty <= 0) throw new ValidationFailedError('数量必须大于 0', { field: 'qtyOrdered' });
}
