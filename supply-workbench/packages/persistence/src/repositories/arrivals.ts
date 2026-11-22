import { count, desc, eq, and, isNull, or, sql } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import { localDate, normalizeUnit } from '@sw/domain';
import type { ArrivalRepository } from '../../../application/src/ports/arrival-repository.js';
import type { Arrival, ArrivalCandidate, RegisterArrivalInput } from '../../../application/src/follow-up/arrivals.js';
import type { AppDatabase } from '../client.js';
import { deliveryBatchId, entityId, orderLineId } from '../mappers/id.js';
import { instant } from '../mappers/time.js';
import { arrivals, arrivalReferences, arrivalRevisions } from '../schema/arrivals.js';
import { importRows } from '../schema/archive.js';
import { deliveryBatches, orderLines, orderLineSnapshots, purchaseOrders } from '../schema/orders.js';
import { orderLineOfRow } from './order-lines.js';
import { purchaseOrderOfRow } from './purchase-orders.js';

// Match the whitespace removed by String.trim() in receipt allocation.
const codePadding = '\t\n\v\f\r \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff';

export function arrivalRepository(db: AppDatabase): ArrivalRepository {
  return {
    list: (input) => listArrivals(db, input),
    get: (id) => readArrival(db, { id, isLocking: false }),
    lock: (id) => readArrival(db, { id, isLocking: true }),
    async register(row) {
      await db.insert(arrivals).values({ ...row, qty: String(row.qty) });
    },
    claimReference: (key, arrivalId) => claimReference(db, { key, arrivalId }),
    async releaseReference(key, arrivalId) {
      await db.delete(arrivalReferences).where(and(eq(arrivalReferences.key, key), eq(arrivalReferences.arrivalId, arrivalId)));
    },
    async replayKey(id, revision) {
      const [row] = await db.select({ key: arrivalRevisions.requestKey }).from(arrivalRevisions)
        .where(and(eq(arrivalRevisions.arrivalId, id), eq(arrivalRevisions.revision, revision)));
      return row?.key;
    },
    async revise(row, requestKey) {
      await db.update(arrivals).set({ revision: row.revision, allocation: row.allocation }).where(eq(arrivals.id, row.id));
      await db.insert(arrivalRevisions).values({ arrivalId: row.id, revision: row.revision, requestKey });
    },
    async lockTargetLine(id) {
      const [row] = await db.select({ line: orderLines, po: purchaseOrders }).from(orderLines)
        .innerJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId)).where(eq(orderLines.id, id))
        .for('no key update', { of: orderLines });
      if (row === undefined) throw new NotFoundError('采购订单行', id);
      return { line: orderLineOfRow(row.line), po: purchaseOrderOfRow(row.po) };
    },
    candidates: (input) => candidates(db, input),
  };
}

async function claimReference(db: AppDatabase, { key, arrivalId }: { readonly key: string; readonly arrivalId: string }): Promise<string> {
  // A concurrent rollback can release the key. An upsert returns the owner under the same key lock.
  const [claimed] = await db.insert(arrivalReferences).values({ key, arrivalId })
    .onConflictDoUpdate({ target: arrivalReferences.key, set: { arrivalId: sql`${arrivalReferences.arrivalId}` } }).returning();
  if (claimed === undefined) throw new NotFoundError('到仓来源');
  return claimed.arrivalId;
}

async function listArrivals(db: AppDatabase, { page, pageSize, pending }: Parameters<ArrivalRepository['list']>[0]) {
  const filter = pending ? isNull(arrivals.allocation) : undefined;
  const [rows, [totals]] = await Promise.all([
    db.select().from(arrivals).where(filter).orderBy(desc(arrivals.receivedOn), desc(arrivals.id)).limit(pageSize).offset((page - 1) * pageSize),
    db.select({ total: count() }).from(arrivals).where(filter),
  ]);
  if (totals === undefined) throw new Error('未返回到仓记录总数');
  return { items: rows.map(toArrival), total: totals.total };
}

async function readArrival(db: AppDatabase, { id, isLocking }: { readonly id: string; readonly isLocking: boolean }): Promise<Arrival> {
  const query = db.select().from(arrivals).where(eq(arrivals.id, id));
  const [row] = isLocking ? await query.for('update') : await query;
  if (row === undefined) throw new NotFoundError('到仓记录', id);
  return toArrival(row);
}

function toArrival(row: typeof arrivals.$inferSelect): Arrival {
  return {
    ...row,
    id: entityId(row.id),
    warehouseId: entityId(row.warehouseId),
    registeredBy: entityId(row.registeredBy),
    registeredAt: instant(row.registeredAt),
    receivedOn: localDate(row.receivedOn),
    qty: Number(row.qty),
  };
}

async function candidates(db: AppDatabase, input: Pick<RegisterArrivalInput, 'warehouseId' | 'itemCode'>): Promise<readonly ArrivalCandidate[]> {
  const rows = await candidateRows(db, input);
  const linesByPo = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.poNumber === null) continue;
    const lines = linesByPo.get(row.poNumber) ?? new Set<string>();
    lines.add(row.lineId);
    linesByPo.set(row.poNumber, lines);
  }
  return rows.map(({ batch, ...row }) => {
    const lines = row.poNumber === null ? undefined : linesByPo.get(row.poNumber);
    return {
      ...row,
      lineId: orderLineId(row.lineId),
      needsLineConfirmation: lines !== undefined && lines.size > 1,
      batch: candidateBatch(batch, row.poNumber !== null),
    };
  });
}

function candidateBatch(batch: Awaited<ReturnType<typeof candidateRows>>[number]['batch'], hasPo: boolean): ArrivalCandidate['batch'] {
  if (batch === null) return null;
  const unit = normalizeUnit(batch.unit);
  return {
    id: deliveryBatchId(batch.id),
    seq: batch.seq,
    plannedQty: Number(batch.plannedQty),
    unit,
    confirmedOn: batch.confirmedOn === null ? null : localDate(batch.confirmedOn),
    canAllocate: hasPo && unit !== null && batch.confirmedOn !== null && batch.closedAt === null && batch.cancelledAt === null,
  };
}

function candidateRows(db: AppDatabase, input: Pick<RegisterArrivalInput, 'warehouseId' | 'itemCode'>) {
  return db.select({
    lineId: orderLines.id,
    poNumber: purchaseOrders.poNorm,
    itemName: orderLines.nameRaw,
    source: { importBatchId: importRows.importBatchId, sheet: importRows.sheetName, rowNo: importRows.rowNo },
    batch: {
      id: deliveryBatches.id,
      seq: deliveryBatches.seq,
      plannedQty: deliveryBatches.plannedQty,
      unit: deliveryBatches.plannedUnit,
      confirmedOn: deliveryBatches.dateBuyerConfirmed,
      closedAt: deliveryBatches.closedAt,
      cancelledAt: deliveryBatches.cancelledAt,
    },
  }).from(orderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId))
    .leftJoin(orderLineSnapshots, and(eq(orderLineSnapshots.id, orderLines.currentSnapshotId), eq(orderLineSnapshots.orderLineId, orderLines.id)))
    .leftJoin(importRows, and(eq(importRows.id, orderLineSnapshots.importRowId), eq(importRows.importBatchId, orderLineSnapshots.importBatchId)))
    .leftJoin(deliveryBatches, and(eq(deliveryBatches.orderLineId, orderLines.id), eq(deliveryBatches.receiverPartyId, input.warehouseId)))
    .where(and(
      isNull(orderLines.cancelledAt),
      sql`coalesce(
        nullif(btrim(${orderLines.itemCodeRaw}, ${codePadding}), ''),
        case when ${orderLines.lane} = 'finished' then btrim(${orderLines.barcodeRaw}, ${codePadding}) end
      ) = ${input.itemCode}`,
      or(eq(orderLines.receiverPartyId, input.warehouseId), eq(deliveryBatches.receiverPartyId, input.warehouseId)),
    ))
    .orderBy(purchaseOrders.poNorm, orderLines.id, deliveryBatches.seq);

}
