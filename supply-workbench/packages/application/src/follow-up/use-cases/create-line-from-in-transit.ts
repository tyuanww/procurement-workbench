import type { EntityId, FactoryReportRow, OrderLine, OrderLineId } from '@sw/domain';
import type { CreateLineFromInTransit, CreateLineFromInTransitDeps } from '../boundary.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { recordManualOwner, requireOwnerAccount } from '../../shared/owner-assignment.js';
import { StateConflictError, ValidationFailedError } from '../../shared/errors.js';
import { createPurchaseOrder, findPurchaseOrders } from './purchase-order-ref.js';

export const makeCreateLineFromInTransit =
  (deps: CreateLineFromInTransitDeps): CreateLineFromInTransit =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    const lineId = deps.ids.orderLine();
    await deps.uow.run(async (tx) => {
      const row = await tx.factoryReports.get(input.rowId);
      const facts = inTransitOf(row);
      if (row.linkedOrderLineId !== null) throw new StateConflictError(row.linkStatus);
      const owner = input.buyerUserId === undefined ? null : await requireOwnerAccount(tx.users, input.buyerUserId);
      const warehouseId = await ownWarehouse(tx);
      const purchaseOrderId = await purchaseOrderIdOf(tx, {
        poRaw: facts.poRaw,
        supplierPartyId: row.factoryPartyId,
        at,
        nextId: () => deps.ids.next(),
      });
      const line = finishedLine({
        lineId,
        purchaseOrderId,
        facts,
        warehouseId,
        buyerUserId: input.buyerUserId ?? null,
        at,
      });
      await tx.orderLines.save(line);
      if (owner !== null) await recordManualOwner({ tx, at, line, owner, nextId: () => deps.ids.next() });
      if (!await tx.factoryReports.linkUnassignedTransit(row.id, lineId)) {
        throw new StateConflictError('在途行已关联订单');
      }
      await tx.audit.record(auditOf({ action: 'line.create', subject: line, ctx: { actor, at, entity: '订单行' } }));
    });
    return { lineId };
  };

function inTransitOf(row: FactoryReportRow): NonNullable<FactoryReportRow['inTransit']> {
  if (row.kind !== 'in_transit' || row.inTransit === null) throw new StateConflictError(row.kind);
  const name = row.inTransit.nameRaw?.trim() ?? '';
  if (name === '') throw new ValidationFailedError('不能为空', { field: 'nameRaw' });
  const qty = row.inTransit.qtyRequired;
  if (qty === null || !Number.isFinite(qty) || qty <= 0)
    throw new ValidationFailedError('数量必须大于 0', { field: 'qtyRequired' });
  return { ...row.inTransit, nameRaw: name, qtyRequired: qty };
}

async function ownWarehouse(tx: UnitOfWorkStores): Promise<EntityId> {
  const warehouseId = (await tx.settings.get()).ownWarehousePartyId;
  if (warehouseId === null)
    throw new ValidationFailedError('没有设置我方仓库', { field: 'ownWarehousePartyId' });
  return warehouseId;
}

async function purchaseOrderIdOf(
  tx: UnitOfWorkStores,
  input: {
    readonly poRaw: string | null;
    readonly supplierPartyId: EntityId;
    readonly at: string;
    readonly nextId: () => EntityId;
  },
): Promise<EntityId> {
  const found = await findPurchaseOrders(tx, { poRaw: input.poRaw, lane: 'finished' });
  if ('reason' in found) throw new StateConflictError(found.reason);
  const existing = found.orders[0];
  if (existing !== undefined) return existing.id;
  return createPurchaseOrder(tx, { ...input, lane: 'finished' });
}

function finishedLine(input: {
  readonly lineId: OrderLineId;
  readonly purchaseOrderId: EntityId;
  readonly facts: NonNullable<FactoryReportRow['inTransit']>;
  readonly warehouseId: EntityId;
  readonly buyerUserId: EntityId | null;
  readonly at: string;
}): OrderLine {
  return {
    id: input.lineId,
    createdAt: input.at,
    updatedAt: input.at,
    purchaseOrderId: input.purchaseOrderId,
    lane: 'finished',
    itemId: null,
    itemCodeRaw: blankToNull(input.facts.itemCodeRaw),
    barcodeRaw: blankToNull(input.facts.barcodeRaw),
    nameRaw: input.facts.nameRaw,
    qtyOrdered: input.facts.qtyRequired,
    unit: null,
    buyerUserId: input.buyerUserId,
    receiverPartyId: input.warehouseId,
    origin: 'from_factory_in_transit',
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

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
