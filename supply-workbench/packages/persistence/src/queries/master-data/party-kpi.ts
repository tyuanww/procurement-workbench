import { eq, inArray } from 'drizzle-orm';
import { LANES, LINE_STAGES, recentMonth, type KpiInput, type LocalDate, type OrderLineLoad } from '@sw/domain';
import type { AppDatabase } from '../../client.js';
import { entityId, entityIdOrNull } from '../../mappers/id.js';
import { instant, instantOrNull } from '../../mappers/time.js';
import { batchDateChanges, deliveryBatches, deliveryNotes, exceptions, orderLines, purchaseOrders, receipts, shipments } from '../../schema/orders.js';
import { oneOf } from '../follow-up/guards.js';
import { toBatch } from '../performance/batch.js';

type Joined = { readonly line: typeof orderLines.$inferSelect; readonly order: typeof purchaseOrders.$inferSelect };

export async function loadPartyKpi(input: { readonly db: AppDatabase; readonly today: LocalDate; readonly partyId: string }): Promise<KpiInput> {
  const window = recentMonth(input.today);
  const joined = await supplierLines(input.db, input.partyId);
  if (joined.length === 0) return emptyKpi({ today: input.today, window });
  return filledKpi({ db: input.db, today: input.today, window, joined });
}

async function supplierLines(db: AppDatabase, partyId: string): Promise<Joined[]> {
  return db
    .select({ line: orderLines, order: purchaseOrders })
    .from(orderLines)
    .innerJoin(purchaseOrders, eq(orderLines.purchaseOrderId, purchaseOrders.id))
    .where(eq(purchaseOrders.supplierPartyId, partyId));
}

function emptyKpi(input: { readonly today: LocalDate; readonly window: { readonly from: LocalDate; readonly to: LocalDate } }): KpiInput {
  return { today: input.today, from: input.window.from, to: input.window.to, batches: [], lines: [], dateChanges: [], exceptions: [] };
}

async function filledKpi(input: { readonly db: AppDatabase; readonly today: LocalDate; readonly window: { readonly from: LocalDate; readonly to: LocalDate }; readonly joined: readonly Joined[] }): Promise<KpiInput> {
  const lineIds = input.joined.map((row) => row.line.id);
  const [batchRows, exceptionRows] = await Promise.all([
    input.db.select().from(deliveryBatches).where(inArray(deliveryBatches.orderLineId, lineIds)),
    input.db.select().from(exceptions).where(inArray(exceptions.orderLineId, lineIds)),
  ]);
  const facts = await batchFacts(input.db, batchRows.map((row) => row.id));
  return assemble({ ...input, batchRows, exceptionRows, facts });
}

async function batchFacts(db: AppDatabase, batchIds: readonly string[]) {
  if (batchIds.length === 0) return { receipts: [], shipments: [], notes: [], changes: [] };
  const [receiptRows, shipmentRows, noteRows, changeRows] = await Promise.all([
    db.select().from(receipts).where(inArray(receipts.batchId, batchIds)),
    db.select().from(shipments).where(inArray(shipments.batchId, batchIds)),
    db.select().from(deliveryNotes).where(inArray(deliveryNotes.batchId, batchIds)),
    db.select().from(batchDateChanges).where(inArray(batchDateChanges.batchId, batchIds)),
  ]);
  return { receipts: receiptRows, shipments: shipmentRows, notes: noteRows, changes: changeRows };
}

function assemble(input: {
  readonly today: LocalDate;
  readonly window: { readonly from: LocalDate; readonly to: LocalDate };
  readonly joined: readonly Joined[];
  readonly batchRows: readonly (typeof deliveryBatches.$inferSelect)[];
  readonly exceptionRows: readonly (typeof exceptions.$inferSelect)[];
  readonly facts: Awaited<ReturnType<typeof batchFacts>>;
}): KpiInput {
  const lines = new Map(input.joined.map((row) => [row.line.id, row.line]));
  const orders = new Map(input.joined.map((row) => [row.order.id, row.order]));
  return {
    today: input.today,
    from: input.window.from,
    to: input.window.to,
    batches: input.batchRows.flatMap((row) => toBatch({ row, lines, orders, receiptRows: input.facts.receipts, shipmentRows: input.facts.shipments, noteRows: input.facts.notes, lane: undefined })),
    lines: input.joined.map((row) => lineLoad(row.line)),
    dateChanges: changesOf(input.facts.changes),
    exceptions: exceptionsOf(input.exceptionRows),
  };
}

function lineLoad(row: typeof orderLines.$inferSelect): OrderLineLoad {
  return {
    id: entityId(row.id),
    buyerUserId: entityIdOrNull(row.buyerUserId),
    lane: oneOf(LANES, row.lane),
    stage: oneOf(LINE_STAGES, row.stage),
  };
}

function changesOf(rows: readonly (typeof batchDateChanges.$inferSelect)[]) {
  return rows.filter((row) => row.field === 'dateBuyerConfirmed').map((row) => ({
    field: 'dateBuyerConfirmed' as const,
    changedAt: instant(row.changedAt),
    isFirstSet: row.oldValue === null,
  }));
}

function exceptionsOf(rows: readonly (typeof exceptions.$inferSelect)[]) {
  return rows.map((row) => ({
    status: row.status === 'closed' ? 'closed' as const : 'open' as const,
    openedAt: instant(row.createdAt),
    closedAt: instantOrNull(row.closedAt),
  }));
}
