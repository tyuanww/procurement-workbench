import {
  BATCH_STATUSES,
  currentlyOverdue,
  diffDays,
  isOpenBatch,
  localDate,
  stuckDistribution,
  type BatchStatus,
  type KpiBatch,
  type KpiInput,
  type LocalDate,
  type WaitingOnKind,
} from '@sw/domain';
import type { GetStuckBatches, GetStuckBatchesDeps } from '../boundary.js';
import type { PerformanceFacts } from '../../ports/performance-read-model.js';
import type { NamedPerson, StuckBuckets, StuckDashboard, StuckItem } from '../views.js';
import { loadScoped } from './scope.js';
import { authorize } from '../../shared/authorize.js';

const STUCK_ITEM_LIMIT = 200;

export const makeGetStuckBatches =
  (deps: GetStuckBatchesDeps): GetStuckBatches =>
  async (input, actor) => {
    authorize(actor, 'dashboard.read');
    // K4、K9 看今天仍开放的批次，不按期间裁。期间进供应商和采购负荷。线会裁。
    return dashboardOf(await loadScoped(deps.performance, input));
  };

function dashboardOf(facts: PerformanceFacts): StuckDashboard {
  return {
    kpis: kpisOf(facts.kpi),
    distribution: distributionOf(facts.kpi.batches, facts.kpi.today),
    items: itemsOf(facts),
  };
}

function kpisOf(kpi: KpiInput): StuckDashboard['kpis'] {
  return {
    openBatches: countStatus(kpi.batches),
    overdue: currentlyOverdue(kpi).numerator,
    awaitingDate: countStatus(kpi.batches, 'awaiting_date'),
    shippedNotReceived: countStatus(kpi.batches, 'shipped'),
  };
}

function countStatus(batches: readonly KpiBatch[], status?: BatchStatus): number {
  return batches.filter((batch) => isListed(batch, status)).length;
}

function isListed(batch: KpiBatch, status: BatchStatus | undefined): boolean {
  if (!isOpenBatch(batch.status)) return false;
  return status === undefined || batch.status === status;
}

function distributionOf(batches: readonly KpiBatch[], today: LocalDate): StuckDashboard['distribution'] {
  const table = stuckDistribution(batches, today);
  return BATCH_STATUSES.flatMap((stage) => {
    const row = table[stage];
    return row === undefined ? [] : [{ stage, buckets: bucketsOf(row) }];
  });
}

function bucketsOf(row: Record<string, number>): StuckBuckets {
  return {
    '0-3': bucketCount(row, '0-3'),
    '4-7': bucketCount(row, '4-7'),
    '8-14': bucketCount(row, '8-14'),
    '15+': bucketCount(row, '15+'),
  };
}

function bucketCount(row: Record<string, number>, key: string): number {
  const value = row[key];
  return value === undefined ? 0 : value;
}

function itemsOf(facts: PerformanceFacts): StuckItem[] {
  return facts.kpi.batches
    .filter((batch) => isOpenBatch(batch.status))
    .flatMap((batch) => itemOf(batch, facts))
    .sort(byDays)
    .slice(0, STUCK_ITEM_LIMIT);
}

function itemOf(batch: KpiBatch, facts: PerformanceFacts): StuckItem[] {
  const days = stageDays(batch, facts.kpi.today);
  if (days === null) return [];
  const label = facts.batchLabels[batch.id];
  const orderLineId = label?.orderLineId ?? null;
  return [{
    batchId: batch.id,
    stage: batch.status,
    daysInStage: days,
    poRaw: label?.poRaw ?? null,
    nameRaw: label?.nameRaw ?? null,
    waitingOn: waitingOf(batch, facts.partyNames),
    buyer: person(batch.buyerUserId, facts.buyerNames),
    dateBuyerConfirmed: batch.dateBuyerConfirmed,
    factoryLinked: onOrderLine(orderLineId, facts.linkedFactoryOrderLineIds),
    factoryUnlinked: onOrderLine(orderLineId, facts.unlinkedFactoryOrderLineIds),
    exceptionOpen: onOrderLine(orderLineId, facts.openExceptionOrderLineIds),
    supplierAliasPending: onOrderLine(orderLineId, facts.pendingSupplierAliasOrderLineIds),
    bomMissing: onOrderLine(orderLineId, facts.bomMissingOrderLineIds),
  }];
}

function onOrderLine(orderLineId: string | null, ids: ReadonlySet<string>): boolean {
  return orderLineId !== null && ids.has(orderLineId);
}

function stageDays(batch: KpiBatch, today: LocalDate): number | null {
  const day = batch.statusChangedAt.split('T')[0];
  if (day === undefined) return null;
  return diffDays(today, localDate(day));
}

function waitingOf(batch: KpiBatch, names: Readonly<Record<string, string>>): StuckItem['waitingOn'] {
  if (batch.status === 'awaiting_date') return { kind: 'internal', partyId: null, displayName: null };
  if (waitsOnReceiver(batch)) return partyWaiting({ kind: 'receiver', partyId: batch.receiverPartyId, names });
  return partyWaiting({ kind: 'supplier', partyId: batch.supplierPartyId, names });
}

function waitsOnReceiver(batch: KpiBatch): boolean {
  if (batch.status === 'shipped' || batch.status === 'partially_received') return true;
  return batch.shipments.some((row) => row.voidedAt === null);
}

function partyWaiting({ kind, partyId, names }: { readonly kind: WaitingOnKind; readonly partyId: string | null; readonly names: Readonly<Record<string, string>> }): StuckItem['waitingOn'] {
  return { kind, partyId, displayName: partyId === null ? null : nameOf(names, partyId) };
}

function person(id: string | null, names: Readonly<Record<string, string>>): NamedPerson | null {
  if (id === null) return null;
  return { id, name: nameOf(names, id) };
}

function nameOf(names: Readonly<Record<string, string>>, id: string): string | null {
  return names[id] ?? null;
}

function byDays(left: StuckItem, right: StuckItem): number {
  if (left.daysInStage !== right.daysInStage) return right.daysInStage - left.daysInStage;
  if (left.batchId === right.batchId) return 0;
  return left.batchId < right.batchId ? -1 : 1;
}
