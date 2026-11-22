import { isOpenBatch } from '../batch/status.js';
import { compareDates } from '../dates.js';
import type { DeliveryBatch, OrderLine } from '../entities/orders.js';
import type { IsoInstant } from '../entities/entity-meta.js';
import type { DeliveryBatchId } from '../values/ids.js';
import type { BatchStatus, LineStage } from '../vocabulary/index.js';
import type { LocalDate } from '../values/local-date.js';

export type LineProjection = {
  readonly stage: LineStage;
  readonly stageChangedAt: IsoInstant;
  readonly nextDueBatchId: DeliveryBatchId | null;
  readonly nextDueDate: LocalDate | null;
};

const OPEN_STAGE = {
  awaiting_date: 'awaiting_date',
  confirmed: 'awaiting_shipment',
  shipped: 'awaiting_receipt',
  partially_received: 'partially_received',
} as const satisfies Partial<Record<BatchStatus, LineStage>>;

export function deriveLineStage(line: Pick<OrderLine, 'cancelledAt' | 'createdAt'>, batches: readonly DeliveryBatch[]): LineStage {
  return projectLine(line, batches).stage;
}

export function projectLine(line: Pick<OrderLine, 'cancelledAt' | 'createdAt'>, batches: readonly DeliveryBatch[]): LineProjection {
  if (line.cancelledAt !== null) return emptyDue('cancelled', line.cancelledAt);
  const live = batches.filter((batch) => batch.status !== 'cancelled');
  if (live.length === 0) return emptyDue('no_batch', line.createdAt);
  const open = live.filter((batch) => isOpenBatch(batch.status));
  if (open.length === 0) return emptyDue('done', latestAt(live));
  const head = earliestOpen(open);
  return {
    stage: stageOf(head.status),
    stageChangedAt: head.statusChangedAt,
    nextDueBatchId: head.id,
    nextDueDate: head.dateBuyerConfirmed,
  };
}

function emptyDue(stage: LineStage, stageChangedAt: IsoInstant): LineProjection {
  return { stage, stageChangedAt, nextDueBatchId: null, nextDueDate: null };
}

function earliestOpen(batches: readonly DeliveryBatch[]): DeliveryBatch {
  let head = batches[0];
  if (head === undefined) throw new Error('没有开放批次');
  for (const batch of batches) {
    if (isBefore(batch, head)) head = batch;
  }
  return head;
}

function isBefore(left: DeliveryBatch, right: DeliveryBatch): boolean {
  if (left.dateBuyerConfirmed === null && right.dateBuyerConfirmed !== null) return false;
  if (left.dateBuyerConfirmed !== null && right.dateBuyerConfirmed === null) return true;
  if (left.dateBuyerConfirmed !== null && right.dateBuyerConfirmed !== null) {
    const byDate = compareDates(left.dateBuyerConfirmed, right.dateBuyerConfirmed);
    if (byDate !== 0) return byDate < 0;
  }
  if (left.seq !== right.seq) return left.seq < right.seq;
  return left.id < right.id;
}

export function isInFollowStage(stage: LineStage): boolean {
  return Object.values(OPEN_STAGE).some((item) => item === stage);
}

function stageOf(status: BatchStatus): LineStage {
  if (status === 'awaiting_date' || status === 'confirmed' || status === 'shipped' || status === 'partially_received') {
    return OPEN_STAGE[status];
  }
  throw new Error('开放批次的状态无法对应阶段');
}

function latestAt(batches: readonly DeliveryBatch[]): IsoInstant {
  let latest = batches[0]?.statusChangedAt;
  if (latest === undefined) throw new Error('没有批次');
  for (const batch of batches) {
    if (batch.statusChangedAt > latest) latest = batch.statusChangedAt;
  }
  return latest;
}
