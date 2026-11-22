import type { ManagementMeetingPeriod, MeetingBatch, MeetingMaterial, MeetingPromise, MeetingPromiseText, MeetingWaitingOn } from '@sw/application';
import { BATCH_STATUSES, batchFulfillment, businessDay, countsInRecordedQuantity, isOpenBatch, localDate, normalizeUnit, type LocalDate } from '@sw/domain';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../client.js';
import { instant } from '../../mappers/time.js';
import { batchDateChanges, deliveryBatches, followUps, receipts, shipments } from '../../schema/orders.js';
import { oneOf } from '../follow-up/guards.js';

type Head = typeof deliveryBatches.$inferSelect;
type DateChange = typeof batchDateChanges.$inferSelect;
type Shipment = typeof shipments.$inferSelect;
type Receipt = typeof receipts.$inferSelect;
type Verification = Record<'shipped' | 'received', boolean>;

type MaterialBatch = {
  readonly view: MeetingBatch;
  readonly fulfillment: ReturnType<typeof batchFulfillment>;
  readonly evidence: Verification;
  readonly required: LocalDate | null;
  readonly planned: number;
};

export async function loadMeetingBatches(input: {
  readonly db: AppDatabase;
  readonly lineIds: readonly string[];
  readonly period: ManagementMeetingPeriod;
  readonly timeZone: string;
}): Promise<ReadonlyMap<string, readonly MaterialBatch[]>> {
  if (input.lineIds.length === 0) return new Map();
  const { db } = input;
  const heads = await db.select().from(deliveryBatches).where(and(
    inArray(deliveryBatches.orderLineId, input.lineIds), ne(deliveryBatches.status, 'cancelled'),
  )).orderBy(asc(deliveryBatches.seq), asc(deliveryBatches.id));
  if (heads.length === 0) return new Map();
  const ids = heads.map((row) => row.id);
  const shipped = await db.select().from(shipments).where(inArray(shipments.batchId, ids));
  const received = await db.select().from(receipts).where(inArray(receipts.batchId, ids));
  const changes = await db.select().from(batchDateChanges)
    .where(and(inArray(batchDateChanges.batchId, ids), eq(batchDateChanges.field, 'dateSupplierPromised')))
    .orderBy(asc(batchDateChanges.changedAt), asc(batchDateChanges.id));
  const previousNotes = await previousPromiseTexts({ db, ids, cutoff: input.period.weekStart, timeZone: input.timeZone });
  const byShipment = group(shipped, (row) => row.batchId);
  const byReceipt = group(received, (row) => row.batchId);
  const byChange = group(changes, (row) => row.batchId);
  return group(heads.map((head) => ({
    orderLineId: head.orderLineId,
    ...toMaterialBatch({
      head, shipped: byShipment.get(head.id) ?? [], received: byReceipt.get(head.id) ?? [],
      changes: byChange.get(head.id) ?? [], previousPromiseText: previousNotes.get(head.id) ?? null,
      period: input.period, timeZone: input.timeZone,
    }),
  })), (row) => row.orderLineId);
}

async function previousPromiseTexts({ db, ids, cutoff, timeZone }: {
  readonly db: AppDatabase;
  readonly ids: readonly string[];
  readonly cutoff: LocalDate;
  readonly timeZone: string;
}): Promise<ReadonlyMap<string, MeetingPromiseText>> {
  const rows = await db.selectDistinctOn([followUps.batchId], {
    batchId: followUps.batchId, text: followUps.text, recordedAt: followUps.createdAt,
  }).from(followUps).where(and(
    inArray(followUps.batchId, ids), eq(followUps.kind, 'promise'),
    sql`(${followUps.createdAt} AT TIME ZONE ${timeZone})::date < ${cutoff}::date`,
  )).orderBy(asc(followUps.batchId), desc(followUps.createdAt), desc(followUps.id));
  return new Map(rows.flatMap(({ batchId, text, recordedAt }) => batchId === null ? [] : [[batchId, { text, recordedAt: instant(recordedAt) }]]));
}

function group<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const bucket = out.get(id);
    if (bucket === undefined) out.set(id, [row]);
    else bucket.push(row);
  }
  return out;
}

function toMaterialBatch(input: {
  readonly head: Head;
  readonly shipped: readonly Shipment[];
  readonly received: readonly Receipt[];
  readonly changes: readonly DateChange[];
  readonly previousPromiseText: MeetingPromiseText | null;
  readonly period: ManagementMeetingPeriod;
  readonly timeZone: string;
}): MaterialBatch {
  const { head, shipped, received } = input;
  const plannedQty = Number(head.plannedQty);
  const fulfillment = batchFulfillment({
    batch: { plannedQty, plannedUnit: head.plannedUnit },
    shipments: shipped.map((row) => ({ ...row, qty: Number(row.qty) })),
    receipts: received.map((row) => ({ ...row, qty: Number(row.qty) })),
  });
  const confirmed = day(head.dateBuyerConfirmed);
  const status = oneOf(BATCH_STATUSES, head.status);
  return {
    planned: plannedQty,
    required: day(head.dateFactoryRequired ?? head.dateBuyerConfirmed ?? head.dateSupplierPromised),
    fulfillment,
    evidence: {
      shipped: shipped.some((row) => row.fulfillment?.kind === 'verified' && countsInRecordedQuantity(row)),
      received: received.some((row) => row.fulfillment?.kind === 'received' && countsInRecordedQuantity(row)),
    },
    view: {
      id: head.id, seq: head.seq,
      previousPromise: previousPromise(input), previousPromiseText: input.previousPromiseText,
      factoryRequired: day(head.dateFactoryRequired), currentPromise: day(head.dateSupplierPromised),
      confirmedArrival: confirmed, waitingOn: isOpenBatch(status) ? waitingOn(fulfillment, confirmed) : ['none'],
    },
  };
}

function previousPromise({ head, changes, period, timeZone }: {
  readonly head: Head;
  readonly changes: readonly DateChange[];
  readonly period: ManagementMeetingPeriod;
  readonly timeZone: string;
}): MeetingPromise | null {
  const cutoff = period.weekStart;
  if (businessDay(head.createdAt, timeZone) >= cutoff) return null;
  const after = changes.find((row) => businessDay(row.changedAt, timeZone) >= cutoff);
  const last = changes.filter((row) => businessDay(row.changedAt, timeZone) < cutoff).at(-1);
  if (last !== undefined) return promise({ value: last.newValue, at: last.changedAt, source: 'change' });
  return promise({ value: after === undefined ? head.dateSupplierPromised : after.oldValue, at: head.createdAt, source: 'batch' });
}

function promise({ value, at, source }: { readonly value: string | null; readonly at: string; readonly source: MeetingPromise['source'] }): MeetingPromise | null {
  return value === null ? null : { date: localDate(value), recordedAt: instant(at), source };
}

function waitingOn(quantity: MaterialBatch['fulfillment'], confirmed: LocalDate | null): readonly MeetingWaitingOn[] {
  if (quantity.reviewCount > 0 || quantity.unshippedQty === null || quantity.inTransitQty === null) return ['verification'];
  const waiting: MeetingWaitingOn[] = [];
  if (quantity.unshippedQty > 0) waiting.push(confirmed === null ? 'buyer' : 'supplier');
  if (quantity.inTransitQty > 0) waiting.push('receiver');
  return waiting.length === 0 ? ['none'] : waiting;
}

function day(value: string | null): LocalDate | null {
  return value === null ? null : localDate(value);
}

type MeetingQuantities = Pick<MeetingMaterial, 'verifiedShippedQty' | 'verifiedReceivedQty' | 'quantityNeedsReview' | 'waitingOn'>;

export function meetingQuantities(input: {
  readonly batches: readonly MaterialBatch[];
  readonly unit: string | null;
  readonly ordered: number | null;
  readonly reportedGap: number | null;
}): MeetingQuantities {
  const { batches, ordered, reportedGap } = input;
  const unit = normalizeUnit(input.unit);
  const compatible = unit === null ? [] : batches.filter(({ fulfillment }) => fulfillment.unit === unit);
  const hasIncompleteEvidence = requiresReview({ batches, compatible, reportedGap, unit });
  const waiting = new Set(compatible.flatMap(({ view }) => view.waitingOn).filter((party) => party !== 'none'));
  const planned = total(compatible.map((batch) => batch.planned));
  if (hasIncompleteEvidence) waiting.add('verification');
  if (!hasIncompleteEvidence && ordered !== null && compatible.length === batches.length && planned < ordered) waiting.add('buyer');
  return {
    verifiedShippedQty: verifiedTotal(compatible, 'shipped'),
    verifiedReceivedQty: verifiedTotal(compatible, 'received'),
    quantityNeedsReview: hasIncompleteEvidence,
    waitingOn: waiting.size === 0 ? ['none'] : [...waiting],
  };
}

function requiresReview({ batches, compatible, reportedGap, unit }: {
  readonly batches: readonly MaterialBatch[];
  readonly compatible: readonly MaterialBatch[];
  readonly reportedGap: number | null;
  readonly unit: string | null;
}): boolean {
  const pending = batches.filter(hasPendingFulfillment);
  return batches.length === 0 || pending.some(({ fulfillment, view }) => fulfillment.unit !== unit || view.waitingOn.includes('verification'))
    || (pending.length > 0 && reportedGap !== null && !compatible.some((batch) => batch.evidence.shipped || batch.evidence.received));
}

function hasPendingFulfillment({ view }: MaterialBatch): boolean {
  return view.waitingOn.some((party) => party !== 'none');
}

function verifiedTotal(batches: readonly MaterialBatch[], kind: keyof Verification): number | null {
  const verified = batches.filter((batch) => batch.evidence[kind]);
  return verified.length === 0 ? null : total(verified.map(({ fulfillment }) =>
    kind === 'shipped' ? fulfillment.verifiedShippedQty : fulfillment.verifiedReceivedQty,
  ));
}

function total(quantities: readonly number[]): number {
  return Number(quantities.reduce((sum, quantity) => sum + quantity, 0).toFixed(4));
}

export function openRisk({ quantities, batches, plannedEnd, weekEnd }: {
  readonly quantities: MeetingQuantities;
  readonly batches: readonly MaterialBatch[];
  readonly plannedEnd: LocalDate | null;
  readonly weekEnd: LocalDate;
}): boolean {
  if (quantities.waitingOn.every((party) => party === 'none')) return false;
  if (plannedEnd !== null) return plannedEnd <= weekEnd;
  const pending = batches.filter(hasPendingFulfillment);
  return pending.length === 0 || pending.some(({ required }) => required === null || required <= weekEnd);
}
