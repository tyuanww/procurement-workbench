import { and, eq, inArray, isNull, lt, notExists, sql } from 'drizzle-orm';
import { bomLines, factoryShipmentRows, lineFactoryLinks, orderLines, partyAliases, products } from '../../schema/index.js';
import { exceptions, ownerAssignments } from '../../schema/orders.js';
import type { AppDatabase } from '../../client.js';

export type BottleneckKey =
  | 'missing_owner'
  | 'missing_factory'
  | 'alias_pending'
  | 'missing_date'
  | 'exception_open'
  | 'aged_15'
  | 'bom_missing'
  | 'factory_demand_unlinked';

export type BottleneckCategory = {
  readonly key: BottleneckKey;
  readonly label: string;
  readonly count: number;
  readonly href: string;
};

export type BottleneckSummary = { readonly categories: readonly BottleneckCategory[] };

const ACTIVE = ['no_batch', 'awaiting_date', 'awaiting_shipment', 'awaiting_receipt', 'partially_received'];
const LINKED = ['linked', 'manual'];

export async function bottleneckSummary(db: AppDatabase, today: string): Promise<BottleneckSummary> {
  const [missingOwner, missingFactory, aliasPending, missingDate, exceptionOpen, aged, bomMissing, factoryUnlinked] = await Promise.all([
    countOf(db.select({ count: sql<number>`count(*)::int` }).from(orderLines).where(and(
      inArray(orderLines.stage, ACTIVE),
      notExists(db.select({ one: sql`1` }).from(ownerAssignments).where(and(
        eq(ownerAssignments.subjectType, 'order_line'),
        eq(ownerAssignments.subjectId, orderLines.id),
        eq(ownerAssignments.status, 'assigned'),
        isNull(ownerAssignments.supersededAt),
      ))),
    ))),
    countOf(db.select({ count: sql<number>`count(*)::int` }).from(orderLines).where(and(
      inArray(orderLines.stage, ACTIVE),
      notExists(db.select({ one: sql`1` }).from(lineFactoryLinks).where(and(eq(lineFactoryLinks.orderLineId, orderLines.id), inArray(lineFactoryLinks.status, LINKED)))),
    ))),
    countOf(db.select({ count: sql<number>`count(*)::int` }).from(partyAliases).where(eq(partyAliases.status, 'pending'))),
    countOf(db.select({ count: sql<number>`count(*)::int` }).from(orderLines).where(eq(orderLines.stage, 'awaiting_date'))),
    countOf(db.select({ count: sql<number>`count(*)::int` }).from(exceptions).where(eq(exceptions.status, 'open'))),
    countOf(db.select({ count: sql<number>`count(*)::int` }).from(orderLines).where(and(inArray(orderLines.stage, ACTIVE), lt(orderLines.stageChangedAt, sql`${today}::date - interval '15 days'`)))),
    countOf(db.select({ count: sql<number>`count(*)::int` }).from(products).where(notExists(db.select({ one: sql`1` }).from(bomLines).where(eq(bomLines.productBarcodeRaw, products.barcodeRaw))))),
    countOf(db.select({ count: sql<number>`count(*)::int` }).from(factoryShipmentRows).where(isNull(factoryShipmentRows.linkedOrderLineId))),
  ]);
  return { categories: [
    { key: 'missing_owner', label: '缺负责人', count: missingOwner, href: '/master?tab=owner-map' },
    { key: 'missing_factory', label: '缺工厂关联', count: missingFactory, href: '/master?tab=factory-link' },
    { key: 'alias_pending', label: '供应商别名待审', count: aliasPending, href: '/master?tab=aliases' },
    { key: 'missing_date', label: '缺确认日期', count: missingDate, href: '/lines?stages=awaiting_date' },
    { key: 'exception_open', label: '异常未关闭', count: exceptionOpen, href: '/lines?hasOpenException=true' },
    { key: 'aged_15', label: '停留 15 天以上', count: aged, href: '/progress' },
    { key: 'bom_missing', label: '产品缺 BOM', count: bomMissing, href: '/products' },
    { key: 'factory_demand_unlinked', label: '工厂出货未关联', count: factoryUnlinked, href: '/master?tab=factory-link' },
  ] };
}

async function countOf(query: Promise<readonly { readonly count: unknown }[]>): Promise<number> {
  const rows = await query;
  const value = rows[0]?.count;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
}
