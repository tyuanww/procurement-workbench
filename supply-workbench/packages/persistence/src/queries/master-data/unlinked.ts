import { and, eq, inArray, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { FactoryReportRowView, LinkedFactoryRow } from '@sw/application';
import { NotFoundError } from '@sw/application/errors';
import type { AppDatabase } from '../../client.js';
import { factoryInTransitRows, factoryMaterialDemandRows, factoryPackagingComboRows, factoryScheduleCells, factoryShipmentRows, factoryStockRows } from '../../schema/factory.js';
import { activeFactoryBatchIds } from '../factory-links/snapshot-scope.js';
import { actionableFactoryReport } from '../factory-report-actionable.js';
import { comboOf, demandOf, scheduleOf, shipmentOf, stockOf, transitOf } from '../follow-up/payloads.js';

type ReportFilter = { readonly factoryPartyId?: string; readonly sheet?: string };

type LinkKind = LinkedFactoryRow['kind'];
type ReportIdentity = { readonly id: string; readonly kind: LinkKind };

export type ReportKey = ReportIdentity & {
  readonly sheetName: string;
  readonly rowNo: number;
};

type ReportTable = {
  readonly id: AnyPgColumn;
  readonly importBatchId: AnyPgColumn;
};

export async function listUnlinkedKeys(db: AppDatabase, query: ReportFilter): Promise<ReportKey[]> {
  const activeIds = [...await activeFactoryBatchIds(db)];
  const rows = await Promise.all([
    reportKeys({ db, query, activeIds, table: factoryInTransitRows, kind: 'in_transit' }),
    reportKeys({ db, query, activeIds, table: factoryShipmentRows, kind: 'shipment' }),
    reportKeys({ db, query, activeIds, table: factoryStockRows, kind: 'stock' }),
    reportKeys({ db, query, activeIds, table: factoryScheduleCells, kind: 'schedule' }),
    reportKeys({ db, query, activeIds, table: factoryMaterialDemandRows, kind: 'demand' }),
    reportKeys({ db, query, activeIds, table: factoryPackagingComboRows, kind: 'packaging_combo' }),
  ]);
  return rows.flat().sort(byKey);
}

export async function hydrateUnlinked(db: AppDatabase, keys: readonly ReportKey[]): Promise<FactoryReportRowView[]> {
  if (keys.length === 0) return [];
  const activeIds = [...await activeFactoryBatchIds(db)];
  const views = viewsOf(await loadPage({ db, keys, activeIds }));
  const byId = new Map(views.map((view) => [`${view.kind}:${view.id}`, view]));
  return keys.flatMap((key) => {
    const view = byId.get(`${key.kind}:${key.id}`);
    return view === undefined ? [] : [view];
  });
}

export async function linkedReportView(db: AppDatabase, input: LinkedFactoryRow): Promise<FactoryReportRowView> {
  const [row] = viewsOf(await loadPage({ db, keys: [{ id: input.rowId, kind: input.kind }] }));
  if (row === undefined) throw new NotFoundError('上报行', input.rowId);
  return row;
}

async function reportKeys(input: {
  readonly db: AppDatabase;
  readonly table: typeof factoryInTransitRows | typeof factoryShipmentRows | typeof factoryStockRows | typeof factoryScheduleCells | typeof factoryMaterialDemandRows | typeof factoryPackagingComboRows;
  readonly kind: LinkKind;
  readonly query: ReportFilter;
  readonly activeIds: readonly string[];
}): Promise<ReportKey[]> {
  const { db, table, kind, query, activeIds } = input;
  const rows = await db.select({ id: table.id, sheetName: table.sheetName, rowNo: table.rowNo }).from(table).where(and(
    actionableFactoryReport(kind, table.linkStatus),
    inArray(table.importBatchId, [...activeIds]),
    query.factoryPartyId === undefined ? undefined : eq(table.factoryPartyId, query.factoryPartyId),
    query.sheet === undefined ? undefined : eq(table.sheetName, query.sheet),
  ));
  return rows.map((row) => ({ ...row, kind }));
}

async function loadPage(input: { readonly db: AppDatabase; readonly keys: readonly ReportIdentity[]; readonly activeIds?: readonly string[] }) {
  const { db, keys, activeIds } = input;
  const transitIds = idsOf(keys, 'in_transit');
  const shipmentIds = idsOf(keys, 'shipment');
  const stockIds = idsOf(keys, 'stock');
  const scheduleIds = idsOf(keys, 'schedule');
  const demandIds = idsOf(keys, 'demand');
  const comboIds = idsOf(keys, 'packaging_combo');
  const [transit, shipment, stock, schedule, demand, combo] = await Promise.all([
    transitIds.length === 0 ? Promise.resolve([]) : db.select().from(factoryInTransitRows).where(scopedByIds({ table: factoryInTransitRows, ids: transitIds, activeIds })),
    shipmentIds.length === 0 ? Promise.resolve([]) : db.select().from(factoryShipmentRows).where(scopedByIds({ table: factoryShipmentRows, ids: shipmentIds, activeIds })),
    stockIds.length === 0 ? Promise.resolve([]) : db.select().from(factoryStockRows).where(scopedByIds({ table: factoryStockRows, ids: stockIds, activeIds })),
    scheduleIds.length === 0 ? Promise.resolve([]) : db.select().from(factoryScheduleCells).where(scopedByIds({ table: factoryScheduleCells, ids: scheduleIds, activeIds })),
    demandIds.length === 0 ? Promise.resolve([]) : db.select().from(factoryMaterialDemandRows).where(scopedByIds({ table: factoryMaterialDemandRows, ids: demandIds, activeIds })),
    comboIds.length === 0 ? Promise.resolve([]) : db.select().from(factoryPackagingComboRows).where(scopedByIds({ table: factoryPackagingComboRows, ids: comboIds, activeIds })),
  ]);
  return { transit, shipment, stock, schedule, demand, combo };
}

function idsOf(keys: readonly ReportIdentity[], kind: LinkKind): string[] {
  return keys.flatMap((key) => key.kind === kind ? [key.id] : []);
}

function viewsOf(loaded: Awaited<ReturnType<typeof loadPage>>): FactoryReportRowView[] {
  return [
    ...loaded.transit.map(transitOf),
    ...loaded.shipment.map(shipmentOf),
    ...loaded.stock.map(stockOf),
    ...loaded.schedule.flatMap(keptSchedule),
    ...loaded.demand.map(demandOf),
    ...loaded.combo.map(comboOf),
  ];
}

function keptSchedule(row: Parameters<typeof scheduleOf>[0]): NonNullable<ReturnType<typeof scheduleOf>>[] {
  const view = scheduleOf(row);
  return view === undefined ? [] : [view];
}

function scopedByIds(input: { readonly table: ReportTable; readonly ids: readonly string[]; readonly activeIds: readonly string[] | undefined }): SQL | undefined {
  const { table, ids, activeIds } = input;
  return and(inArray(table.id, [...ids]), activeIds === undefined ? undefined : inArray(table.importBatchId, [...activeIds]));
}

function byKey(left: ReportKey, right: ReportKey): number {
  const sheet = compareText(left.sheetName, right.sheetName);
  if (sheet !== 0) return sheet;
  if (left.rowNo !== right.rowNo) return left.rowNo - right.rowNo;
  const kind = compareText(left.kind, right.kind);
  if (kind !== 0) return kind;
  return compareText(left.id, right.id);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
