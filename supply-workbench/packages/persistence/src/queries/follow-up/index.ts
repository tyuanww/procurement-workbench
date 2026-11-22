import { eq } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import type { LatestNoteQueries } from '../../../../application/src/ports/latest-note-queries.js';
import type { LineQueries } from '../../../../application/src/ports/line-queries.js';
import type { TimelineQueries } from '../../../../application/src/ports/timeline-queries.js';
import type { DeliveryBatchId, LocalDate, OrderLineId } from '@sw/domain';
import type { AppDatabase } from '../../client.js';
import { deliveryBatchId, orderLineId } from '../../mappers/id.js';
import { deliveryBatchRepository } from '../../repositories/delivery-batches.js';
import { exceptions } from '../../schema/orders.js';
import { batchView } from './batch-view.js';
import { latestNotes } from './latest-notes.js';
import { lineDetail } from './line-detail.js';
import { listLines, summarizeLines } from './line-list.js';
import { lineTimeline } from './timeline.js';

type Clock = { today(): LocalDate; now(): string };

export function followUpQueries({ db, clock, timeZone }: { readonly db: AppDatabase; readonly clock: Clock; readonly timeZone: string }): LineQueries & {
  batchIdOf(kind: 'shipment' | 'receipt' | 'delivery_note', recordId: string): Promise<DeliveryBatchId>;
  exceptionLineId(exceptionId: string): Promise<OrderLineId>;
} {
  const read = { db, clock, timeZone };
  return {
    list: (query) => listLines(read, query),
    summary: (query) => summarizeLines(read, query),
    getDetail: (lineId, store) => lineDetail(read, { lineId, store }),
    getBatch: (batchId) => batchView(read, batchId),
    batchIdOf: (kind, recordId) => batchIdOf({ db, kind, recordId }),
    exceptionLineId: (exceptionId) => exceptionLineId(db, exceptionId),
  };
}

export function latestNoteQueries(db: AppDatabase): LatestNoteQueries {
  return { latest: (orderLineIds) => latestNotes(db, orderLineIds) };
}

export function timelineQueries(db: AppDatabase): TimelineQueries {
  return { list: (lineId, cursor) => lineTimeline({ db, lineId, cursor }) };
}

async function exceptionLineId(db: AppDatabase, exceptionId: string): Promise<OrderLineId> {
  const row = (await db.select().from(exceptions).where(eq(exceptions.id, exceptionId)))[0];
  if (row === undefined) throw new NotFoundError('异常', exceptionId);
  return orderLineId(row.orderLineId);
}

async function batchIdOf({ db, kind, recordId }: { readonly db: AppDatabase; readonly kind: 'shipment' | 'receipt' | 'delivery_note'; readonly recordId: string }): Promise<DeliveryBatchId> {
  const batchId = await deliveryBatchRepository(db).findBatchIdOf(kind, recordId);
  if (batchId === undefined) throw new NotFoundError('记录', recordId);
  return deliveryBatchId(batchId);
}
