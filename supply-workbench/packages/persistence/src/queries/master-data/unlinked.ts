import { and, eq, inArray, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { FactoryReportRowView, LinkedFactoryRow } from '@sw/application';
import { NotFoundError } from '@sw/application/errors';
import type { AppDatabase } from '../../client.js';
import { factoryInTransitRows, factoryMaterialDemandRows, factoryPackagingComboRows, factoryScheduleCells, factoryShipmentRows, factoryStockRows } from '../../schema/factory.js';
import { activeFactoryBatchIds } from '../follow-up/line-row.js';
import { comboOf, demandOf, scheduleOf, shipmentOf, stockOf, transitOf } from '../follow-up/payloads.js';

const OPEN_LINKS = ['unlinked', 'ambiguous'] as const;

type ReportFilter = { readonly factoryPartyId?: string; readonly sheet?: string };

type LinkKind = LinkedFactoryRow['kind'];
type ReportIdentity = { readonly id: string; readonly kind: LinkKind };

export type ReportKey = ReportIdentity & {
  readonly sheetName: string;
  readonly rowNo: number;
};

type LinkTable = {
  readonly linkStatus: AnyPgColumn;
  readonly factoryPartyId: AnyPgColumn;
  readonly sheetName: AnyPgColumn;
  readonly importBatchId: AnyPgColumn;
};

type ReportTable = {
  readonly id: AnyPgColumn;
  readonly importBatchId: AnyPgColumn;
};

export async function listUnlinkedKeys(db: AppDatabase, query: ReportFilter): Promise<ReportKey[]> {
  const activeIds = [...await activeFactoryBatchIds(db)];
  const [transit, shipment, stock, schedule, demand, combo] = await Promise.all([
    db.select({ id: factoryInTransitRows.id, sheetName: factoryInTransitRows.sheetName, rowNo: factoryInTransitRows.rowNo }).from(factoryInTransitRows).where(openWhere({ table: factoryInTransitRows, query, activeIds })),
    db.select({ id: factoryShipmentRows.id, sheetName: factoryShipmentRows.sheetName, rowNo: factoryShipmentRows.rowNo }).from(factoryShipmentRows).where(openWhere({ table: factoryShipmentRows, query, activeIds })),
    db.select({ id: factoryStockRows.id, sheetName: factoryStockRows.sheetName, rowNo: factoryStockRows.rowNo }).from(factoryStockRows).where(openWhere({ table: factoryStockRows, query, activeIds })),
    db.select().from(factoryScheduleCells).where(openWhere({ table: factoryScheduleCells, query, activeIds })),
    db.select({ id: factoryMaterialDemandRows.id, sheetName: factoryMaterialDemandRows.sheetName, rowNo: factoryMaterialDemandRows.rowNo }).from(factoryMaterialDemandRows).where(openWhere({ table: factoryMaterialDemandRows, query, activeIds })),
    db.select({ id: factoryPackagingComboRows.id, sheetName: factoryPackagingComboRows.sheetName, rowNo: factoryPackagingComboRows.rowNo }).from(factoryPackagingComboRows).where(openWhere({ table: factoryPackagingComboRows, query, activeIds })),
  ]);
  return [
    ...stamp(transit, 'in_transit'),
    ...stamp(shipment, 'shipment'),
    ...stamp(stock, 'stock'),
    ...schedule.flatMap((row) => scheduleOf(row) === undefined ? [] : stamp([row], 'schedule')),
    ...stamp(demand, 'demand'),
    ...stamp(combo, 'packaging_combo'),
  ].sort(byKey);
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

function stamp(rows: readonly { readonly id: string; readonly sheetName: string; readonly rowNo: number }[], kind: LinkKind): ReportKey[] {
  return rows.map((row) => ({ id: row.id, sheetName: row.sheetName, rowNo: row.rowNo, kind }));
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

function openWhere(input: { readonly table: LinkTable; readonly query: ReportFilter; readonly activeIds: readonly string[] }): SQL | undefined {
  const { table, query, activeIds } = input;
  return and(
    inArray(table.linkStatus, [...OPEN_LINKS]),
    inArray(table.importBatchId, [...activeIds]),
    query.factoryPartyId === undefined ? undefined : eq(table.factoryPartyId, query.factoryPartyId),
    query.sheet === undefined ? undefined : eq(table.sheetName, query.sheet),
  );
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
