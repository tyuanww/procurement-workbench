import { and, desc, inArray, isNotNull, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../client.js';
import { factoryInTransitRows, factoryShipmentRows, factoryStockRows } from '../../schema/factory.js';
import { lineFactoryLinks } from '../../schema/orders.js';

export type EffectiveFactoryLink = Pick<typeof lineFactoryLinks.$inferSelect, 'orderLineId' | 'factoryPartyId' | 'status' | 'source' | 'confidence' | 'reason' | 'linkedAt'>;

type Scope = {
  readonly db: AppDatabase;
  readonly activeFactoryBatchIds: ReadonlySet<string>;
  readonly lineIds?: readonly string[];
};

type ReportTable = typeof factoryShipmentRows | typeof factoryInTransitRows | typeof factoryStockRows;

const LINK_PRIORITY = {
  recordedDecision: 0,
  shipment: 1,
  inTransit: 2,
  stock: 3,
  automaticUnlinked: 4,
} as const;

export function effectiveFactoryLinks(scope: Scope) {
  const { db, lineIds } = scope;
  const recorded = db.select({
    orderLineId: lineFactoryLinks.orderLineId,
    factoryPartyId: lineFactoryLinks.factoryPartyId,
    status: lineFactoryLinks.status,
    source: lineFactoryLinks.source,
    confidence: lineFactoryLinks.confidence,
    reason: lineFactoryLinks.reason,
    linkedAt: lineFactoryLinks.linkedAt,
    id: lineFactoryLinks.id,
    priority: sql<number>`case when ${lineFactoryLinks.status} = 'unlinked' and ${lineFactoryLinks.source} <> 'manual'
      then ${LINK_PRIORITY.automaticUnlinked}::int else ${LINK_PRIORITY.recordedDecision}::int end`.as('priority'),
  }).from(lineFactoryLinks).where(lineIds === undefined ? undefined : inArray(lineFactoryLinks.orderLineId, [...lineIds]));
  const candidates = recorded
    .unionAll(reportLinks(scope, { table: factoryShipmentRows, priority: LINK_PRIORITY.shipment }))
    .unionAll(reportLinks(scope, { table: factoryInTransitRows, priority: LINK_PRIORITY.inTransit }))
    .unionAll(reportLinks(scope, { table: factoryStockRows, priority: LINK_PRIORITY.stock }))
    .as('factory_link_candidates');
  return db.selectDistinctOn([candidates.orderLineId], {
    orderLineId: candidates.orderLineId,
    factoryPartyId: candidates.factoryPartyId,
    status: candidates.status,
    source: candidates.source,
    confidence: candidates.confidence,
    reason: candidates.reason,
    linkedAt: candidates.linkedAt,
  }).from(candidates).orderBy(candidates.orderLineId, candidates.priority, desc(candidates.linkedAt), candidates.id);
}

function reportLinks({ db, activeFactoryBatchIds, lineIds }: Scope, { table, priority }: { readonly table: ReportTable; readonly priority: number }) {
  return db.select({
    orderLineId: sql<string>`${table.linkedOrderLineId}`.as('order_line_id'),
    factoryPartyId: table.factoryPartyId,
    status: sql<string>`'linked'::text`.as('status'),
    source: sql<string>`'factory_progress'::text`.as('source'),
    confidence: sql<string>`'none'::text`.as('confidence'),
    reason: sql<string | null>`null::text`.as('reason'),
    linkedAt: table.updatedAt,
    id: table.id,
    priority: sql<number>`${priority}::int`.as('priority'),
  }).from(table).where(and(
    isNotNull(table.linkedOrderLineId),
    inArray(table.linkStatus, ['linked', 'manual']),
    inArray(table.importBatchId, [...activeFactoryBatchIds]),
    lineIds === undefined ? undefined : inArray(table.linkedOrderLineId, [...lineIds]),
  ));
}
