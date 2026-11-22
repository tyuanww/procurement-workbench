import type { EntityId, FactoryDemandFacts, OrderLine, OrderLineId } from '@sw/domain';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { createPurchaseOrder, findPurchaseOrders } from './purchase-order-ref.js';

export type MaterialLine =
  { readonly lineId: OrderLineId; readonly created: boolean } | { readonly reason: string };

type ResolveInput = {
  readonly demand: FactoryDemandFacts;
  readonly factoryPartyId: EntityId;
  readonly at: string;
  readonly nextOrderLineId: () => OrderLineId;
  readonly nextEntityId: () => EntityId;
};

export async function resolveMaterialLine(
  tx: UnitOfWorkStores,
  input: ResolveInput,
): Promise<MaterialLine> {
  const itemCode = blankToNull(input.demand.itemCodeRaw);
  if (itemCode === null) return { reason: '没有材料品号' };
  const found = await findPurchaseOrders(tx, {
    poRaw: input.demand.blockMaterialPoRaw,
    lane: 'material',
  });
  if ('reason' in found) return found;
  const existing = found.orders[0];
  if (existing !== undefined)
    return lineOnOrder(tx, { ...input, itemCode, purchaseOrderId: existing.id });
  return createLine(tx, { ...input, itemCode, purchaseOrderId: null });
}

async function lineOnOrder(
  tx: UnitOfWorkStores,
  input: ResolveInput & { readonly itemCode: string; readonly purchaseOrderId: EntityId },
): Promise<MaterialLine> {
  const matches = (await tx.orderLines.listByPurchaseOrder(input.purchaseOrderId)).filter((line) =>
    sameMaterial(line, input.itemCode),
  );
  const open = matches.filter((line) => line.cancelledAt === null);
  if (open.length > 1) return { reason: '匹配到多条订单行' };
  const found = open[0];
  if (found !== undefined) return { lineId: found.id, created: false };
  if (matches.length > 0) return { reason: '订单行已取消' };
  return createLine(tx, { ...input, purchaseOrderId: input.purchaseOrderId });
}

async function createLine(
  tx: UnitOfWorkStores,
  input: ResolveInput & { readonly itemCode: string; readonly purchaseOrderId: EntityId | null },
): Promise<MaterialLine> {
  const name = blankToNull(input.demand.nameRaw);
  if (name === null) return { reason: '没有材料品名' };
  const purchaseOrderId =
    input.purchaseOrderId ??
    (await createPurchaseOrder(tx, {
      poRaw: input.demand.blockMaterialPoRaw,
      lane: 'material',
      supplierPartyId: input.factoryPartyId,
      at: input.at,
      nextId: input.nextEntityId,
    }));
  const lineId = input.nextOrderLineId();
  await tx.orderLines.save(materialLine({ ...input, lineId, purchaseOrderId, name }));
  return { lineId, created: true };
}

function sameMaterial(line: OrderLine, itemCode: string): boolean {
  return line.lane === 'material' && line.itemCodeRaw === itemCode;
}

function materialLine(
  input: ResolveInput & {
    readonly lineId: OrderLineId;
    readonly purchaseOrderId: EntityId;
    readonly itemCode: string;
    readonly name: string;
  },
): OrderLine {
  return {
    id: input.lineId,
    createdAt: input.at,
    updatedAt: input.at,
    purchaseOrderId: input.purchaseOrderId,
    lane: 'material',
    itemId: null,
    itemCodeRaw: input.itemCode,
    barcodeRaw: null,
    nameRaw: input.name,
    qtyOrdered: null,
    unit: null,
    buyerUserId: null,
    receiverPartyId: input.factoryPartyId,
    origin: 'from_factory_demand',
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
