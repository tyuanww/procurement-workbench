import { and, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import type { LinesQuery } from '@sw/application';
import { batchFulfillment, normalizeText } from '@sw/domain';
import type { AppDatabase } from '../../client.js';
import { fulfillmentRecordsByLines } from '../../repositories/delivery-batches.js';
import { lineFactoryLinkRepository } from '../../repositories/line-factory-links.js';
import { aliasRepository, partyRepository } from '../../repositories/parties.js';
import { lineFactoryLinks, orderLines, purchaseOrders } from '../../schema/orders.js';

const FACTORY_NAMES: Record<NonNullable<LinesQuery['inTransitFactory']>, string> = { yinong: '宜侬' };

export function linkedFactoryWhere(db: AppDatabase, partyId: string): SQL {
  const linkedLines = db.select({ id: lineFactoryLinks.orderLineId }).from(lineFactoryLinks)
    .where(and(eq(lineFactoryLinks.factoryPartyId, partyId), inArray(lineFactoryLinks.status, ['linked', 'manual'])));
  return inArray(orderLines.id, linkedLines);
}

export async function inTransitFactoryWhere({ db, factory, where }: {
  readonly db: AppDatabase;
  readonly factory: NonNullable<LinesQuery['inTransitFactory']>;
  readonly where: SQL | undefined;
}): Promise<SQL | undefined> {
  const partyId = await factoryPartyId(db, FACTORY_NAMES[factory]);
  if (partyId === undefined) return sql`false`;
  const candidates = await db.select({ id: orderLines.id }).from(orderLines)
    .innerJoin(purchaseOrders, eq(orderLines.purchaseOrderId, purchaseOrders.id))
    .where(and(where, isNull(orderLines.cancelledAt), linkedFactoryWhere(db, partyId)));
  const lineIds = await openInTransitLines(db, candidates.map(({ id }) => id));
  return and(where, inArray(orderLines.id, lineIds));
}

async function factoryPartyId(db: AppDatabase, name: string): Promise<string | undefined> {
  const alias = await aliasRepository(db).findByNormName(normalizeText(name));
  if (alias?.status === 'approved' && alias.partyId !== null) {
    const mapped = await partyRepository(db).find(alias.partyId);
    return mapped?.isFactory === true ? mapped.id : undefined;
  }
  const matches = await lineFactoryLinkRepository(db).findFactoriesByName(name);
  return matches.length === 1 ? matches[0]?.id : undefined;
}

async function openInTransitLines(db: AppDatabase, candidates: readonly string[]): Promise<string[]> {
  const rows = await fulfillmentRecordsByLines(db, candidates);
  const shipments = byBatch(rows.shipments);
  const receipts = byBatch(rows.receipts);
  const lineIds = new Set<string>();
  for (const batch of rows.batches) {
    if (batch.status === 'cancelled' || batch.status === 'closed') continue;
    const facts = batchFulfillment({ batch, shipments: shipments.get(batch.id) ?? [], receipts: receipts.get(batch.id) ?? [] });
    if (facts.inTransitQty !== null && facts.inTransitQty > 0) lineIds.add(batch.orderLineId);
  }
  return [...lineIds];
}

function byBatch<T extends { readonly batchId: string }>(rows: readonly T[]): ReadonlyMap<string, readonly T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.batchId);
    if (group === undefined) groups.set(row.batchId, [row]);
    else group.push(row);
  }
  return groups;
}
