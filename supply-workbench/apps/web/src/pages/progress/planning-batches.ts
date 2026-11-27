import type { DeliveryScheduleBatch, DeliveryScheduleTask, OrderLineDetail, ProductDevelopmentNode, ProductDevelopmentProject } from '@sw/contracts';
import { countsInRecordedQuantity, roundQuantity, type BatchStatus, type LocalDate } from '@sw/domain';
import type { ScheduleFilters } from '../../features/progress/index.js';

type BatchDates = Pick<DeliveryScheduleBatch, 'confirmed' | 'firstConfirmed' | 'required' | 'supplierPromised'>;

type PlanningBatchHead = {
  readonly id: string;
  readonly seq: number;
  readonly orderLineId: string;
  readonly timelineConfirmed: LocalDate | null;
  readonly receiptDates: readonly LocalDate[];
  readonly status: BatchStatus | null;
  readonly orderName: string | null;
};

export type OrderPlanningBatch = PlanningBatchHead & {
  readonly kind: 'order';
  readonly facts: OrderBatchFacts;
  readonly node?: NodeSource;
  readonly weeklyDelivery?: WeeklyOrderDelivery;
};

export type WeeklyOrderDelivery = {
  readonly timing: 'overdue' | 'upcoming' | 'due-today' | 'needs-review' | 'settled';
  readonly supplier: DeliveryScheduleBatch['supplier'];
  readonly actions: readonly WeeklyOrderAction[];
};

export type WeeklyOrderAction =
  | { readonly kind: 'expedite'; readonly qty: number; readonly unit: string }
  | { readonly kind: 'check-receipt'; readonly reason: 'checked-shipment' | 'incomplete-evidence' }
  | { readonly kind: 'track'; readonly by: 'confirmed-date' | 'check-promise' | 'confirm-date' };

export type NodeSource = { readonly kind: 'development'; readonly project: ProductDevelopmentProject; readonly node: ProductDevelopmentNode };

export type DevelopmentPlanningBatch = PlanningBatchHead & {
  readonly kind: 'development';
  readonly node: NodeSource;
  readonly received: number | null;
  readonly plannedQty: number | null;
  readonly unit: string | null;
  readonly owner: string | null;
};

export type PlanningBatch = OrderPlanningBatch | DevelopmentPlanningBatch;

export type OrderBatchFacts = {
  readonly confirmed: LocalDate | null;
  readonly original: LocalDate | null;
  readonly conflict: Pick<BatchDates, 'required' | 'supplierPromised'> | null;
  readonly plannedQty: number | null;
  readonly receivedQty: number | null;
  readonly outstandingQty: number | null;
  readonly unshippedQty: number | null;
  readonly unit: string | null;
  readonly owner: DeliveryScheduleBatch['buyer'];
};

export function orderBatchFacts({ confirmed, firstConfirmed, required, supplierPromised, plannedQty, fulfillment, owner }:
  BatchDates & Pick<OrderBatchFacts, 'plannedQty' | 'owner'> & {
    readonly fulfillment: Pick<DeliveryScheduleBatch['fulfillment'], 'unit' | 'receivedQty' | 'unshippedQty'> | null;
  }): OrderBatchFacts {
  const receivedQty = fulfillment?.receivedQty ?? null;
  return {
    confirmed, original: firstConfirmed === confirmed ? null : firstConfirmed, owner, plannedQty, receivedQty,
    conflict: deliveryDateConflict({ confirmed, required, supplierPromised }),
    outstandingQty: plannedQty === null || receivedQty === null ? null : roundQuantity(Math.max(plannedQty - receivedQty, 0)),
    unshippedQty: fulfillment?.unshippedQty ?? null, unit: fulfillment?.unit ?? null,
  };
}

function deliveryDateConflict({ confirmed, required, supplierPromised }: Omit<BatchDates, 'firstConfirmed'>): OrderBatchFacts['conflict'] {
  const hasConflict = isLater(confirmed, required) || isLater(supplierPromised, required) || isLater(supplierPromised, confirmed);
  return hasConflict ? { required, supplierPromised } : null;
}

function isLater(date: LocalDate | null, deadline: LocalDate | null): boolean {
  return date !== null && deadline !== null && date > deadline;
}

export function scheduledPlanningBatch(batch: DeliveryScheduleBatch): OrderPlanningBatch {
  return {
    kind: 'order', id: batch.id, seq: batch.seq, orderLineId: batch.orderLineId, orderName: batch.orderName, status: batch.status,
    receiptDates: batch.receiptDates, timelineConfirmed: batch.confirmed, facts: orderBatchFacts({ ...batch, owner: batch.buyer }),
  };
}

export function selectedPlanningBatches(detail: OrderLineDetail): readonly OrderPlanningBatch[] {
  const { line } = detail;
  const owner = line.buyer !== null && line.buyer.name === line.buyer.id ? { id: line.buyer.id, name: null } : line.buyer;
  return detail.batches.filter((batch) => batch.cancelledAt === null).map((batch) => ({
    kind: 'order', id: batch.id, seq: batch.seq, orderLineId: line.id, timelineConfirmed: batch.dateBuyerConfirmed,
    receiptDates: [...new Set(batch.receipts.filter((receipt) => receipt.fulfillment?.kind === 'received' && countsInRecordedQuantity(receipt))
      .map((receipt) => receipt.receivedOn))].sort(),
    status: batch.status, orderName: line.nameRaw ?? line.po.poRaw,
    facts: orderBatchFacts({
      confirmed: batch.dateBuyerConfirmed, firstConfirmed: batch.firstConfirmedDate,
      required: batch.dateFactoryRequired, supplierPromised: batch.dateSupplierPromised,
      plannedQty: batch.plannedQty, fulfillment: batch.fulfillment ?? null, owner,
    }),
  }));
}

export function planningBatchesBySource({ nodes, selectedBatches, deliveryBatches }: {
  readonly nodes: readonly NodeSource[];
  readonly selectedBatches: readonly OrderPlanningBatch[];
  readonly deliveryBatches: readonly DeliveryScheduleBatch[] | undefined;
}): readonly PlanningBatch[] {
  const base = [...(deliveryBatches ?? []).map(scheduledPlanningBatch), ...selectedBatches];
  const unique = new Map<string, PlanningBatch>(base.map((batch) => [batch.id, batch]));
  for (const source of nodes) {
    const link = source.node.formalLink;
    if (link === null) continue;
    for (const batch of source.node.batches) {
      const selected = unique.get(batch.id);
      if (selected?.node !== undefined) continue;
      unique.set(batch.id, linkedPlanningBatch({
        batch, source, orderLineId: link.procurementLineId, selected, hasOrderProjection: deliveryBatches !== undefined,
      }));
    }
  }
  return [...unique.values()];
}

function linkedPlanningBatch({ batch, source, orderLineId, selected, hasOrderProjection }: {
  readonly batch: ProductDevelopmentNode['batches'][number];
  readonly source: NodeSource;
  readonly orderLineId: string;
  readonly selected: PlanningBatch | undefined;
  readonly hasOrderProjection: boolean;
}): PlanningBatch {
  const { id, seq, buyerConfirmedOn, fulfillment } = batch;
  if (selected?.kind === 'order') return { ...selected, node: source, orderName: source.project.title };
  const head = { id, seq, orderLineId, orderName: source.project.title, node: source,
    timelineConfirmed: buyerConfirmedOn, status: batch.status ?? null, receiptDates: batch.receiptDates ?? [] };
  const plannedQty = batch.plannedQty ?? null;
  if (!hasOrderProjection) return { kind: 'development', ...head, plannedQty, owner: source.node.buyerName, received: fulfillment.receivedQty, unit: fulfillment.unit };
  const { buyerUserId, buyerName } = source.node;
  const facts = orderBatchFacts({ confirmed: buyerConfirmedOn, firstConfirmed: null, required: null, supplierPromised: batch.supplierPromisedOn,
    plannedQty, fulfillment, owner: buyerUserId === null ? null : { id: buyerUserId, name: buyerName } });
  return { kind: 'order', ...head, facts };
}

export function matchesDeliveryParties(batch: DeliveryScheduleBatch, filters: ScheduleFilters): boolean {
  return [
    { filter: filters.ownerUserId, party: batch.buyer },
    { filter: filters.supplierPartyId, party: batch.supplier },
    { filter: filters.factoryPartyId, party: batch.factory },
  ].every(({ filter, party }) => filter === null || filter === (party?.id ?? 'unassigned'));
}

export function scheduledBatchProjection({ deliveryBatches = [], deliveryTasks = [], filters }: {
  readonly deliveryBatches?: readonly DeliveryScheduleBatch[] | undefined;
  readonly deliveryTasks?: readonly DeliveryScheduleTask[] | undefined;
  readonly filters: ScheduleFilters;
}) {
  const byId = new Map(deliveryBatches.map((batch) => [batch.id, batch]));
  const matchingTasks = new Set(deliveryTasks.flatMap(({ task }) =>
    task.status === filters.status && task.batch?.id !== undefined ? [task.batch.id] : []));
  return {
    get: (id: string) => byId.get(id),
    matches: (batch: DeliveryScheduleBatch) => matchesDeliveryParties(batch, filters) && (filters.status === null || matchingTasks.has(batch.id)),
  };
}

export function planningBatchRefs({ batch, delivery }: { readonly batch: PlanningBatch; readonly delivery: DeliveryScheduleBatch | undefined }): readonly (string | null | undefined)[] {
  return [batch.orderName, delivery?.poRaw, delivery?.oaRef, delivery?.itemCode, batch.node?.node.title, batch.node?.node.formalLink?.oaRef];
}

export function weeklySupplierText(supplier: WeeklyOrderDelivery['supplier']): string {
  return `供应商 ${supplier === null ? '未指定' : supplier.name ?? '待核对'}`;
}
