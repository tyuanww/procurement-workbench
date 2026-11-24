import { and, count, inArray, isNull, not, notInArray, sql, type SQL } from 'drizzle-orm';
import { unionAll } from 'drizzle-orm/pg-core';
import type { FactoryReportKind } from '@sw/domain';
import type { FactoryDiagnosticPageQuery, UnmatchedFactoryRowView } from '../../../../application/src/ports/factory-link-views.js';
import type { ListResult } from '../../../../application/src/shared/page.js';
import type { AppDatabase } from '../../client.js';
import { customerSuppliedReceiptRows, factoryInTransitRows, factoryMaterialDemandRows, factoryPackagingComboRows, factoryScheduleCells, factoryShipmentRows, factoryStockRows } from '../../schema/factory.js';
import { actionableFactoryReport } from '../factory-report-actionable.js';
import { activeFactoryBatchIds } from '../follow-up/line-row.js';

const REPORT_TABLES = {
  shipment: factoryShipmentRows,
  in_transit: factoryInTransitRows,
  stock: factoryStockRows,
  schedule: factoryScheduleCells,
  packaging_combo: factoryPackagingComboRows,
  customer_supplied: customerSuppliedReceiptRows,
  demand: factoryMaterialDemandRows,
} satisfies Record<FactoryReportKind, unknown>;

type Scope = { readonly kind: 'all' } | { readonly kind: FactoryDiagnosticPageQuery['scope']; readonly activeIds: string[] };

export async function listUnmatched(db: AppDatabase, limit: number): Promise<readonly UnmatchedFactoryRowView[]> {
  const rows = unmatchedReports(db, { kind: 'all' });
  const page = await db.select().from(rows).orderBy(sql`${rows.rowId} collate "C"`, rows.kind).limit(limit);
  return page.map(diagnosticView);
}

export async function listDiagnosticPage(db: AppDatabase, input: FactoryDiagnosticPageQuery): Promise<ListResult<UnmatchedFactoryRowView>> {
  const { scope, page, pageSize } = input;
  const rows = unmatchedReports(db, { kind: scope, activeIds: [...await activeFactoryBatchIds(db)] });
  const paged = db.select().from(rows).orderBy(sql`${rows.rowId} collate "C"`, rows.kind)
    .limit(pageSize).offset((page - 1) * pageSize).as('paged');
  // 一条语句取结果和总数，空页也由计数子查询保留总数。
  const counted = db.select({ total: count().as('total') }).from(rows).as('counted');
  const results = await db.select({ total: counted.total, row: {
    rowId: paged.rowId,
    kind: paged.kind,
    factoryPartyId: paged.factoryPartyId,
    poRaw: paged.poRaw,
    itemCodeRaw: paged.itemCodeRaw,
    barcodeRaw: paged.barcodeRaw,
    linkReason: paged.linkReason,
  } }).from(counted).leftJoin(paged, sql`true`).orderBy(sql`${paged.rowId} collate "C"`, paged.kind);
  const [first] = results;
  if (first === undefined) throw new Error('工厂诊断计数没有返回结果');
  return { items: results.flatMap(({ row }) => row === null ? [] : [diagnosticView(row)]), page: { page, pageSize, total: first.total } };
}

function unmatchedReports(db: AppDatabase, scope: Scope) {
  const report = (kind: FactoryReportKind) => unmatchedInTable(db, { kind, scope });
  // 各表内 ID 唯一，种类保留为联合结果的一部分，跨表相同的 ID 仍是不同上报行。
  return unionAll(
    report('shipment'),
    report('in_transit'),
    report('stock'),
    report('schedule'),
    report('packaging_combo'),
    report('customer_supplied'),
    report('demand'),
  ).as('unmatched');
}

function unmatchedInTable(db: AppDatabase, { kind, scope }: { readonly kind: FactoryReportKind; readonly scope: Scope }) {
  const table = REPORT_TABLES[kind];
  return db.select({
    rowId: table.id,
    kind: sql<FactoryReportKind>`${kind}::text`.as('kind'),
    factoryPartyId: table.factoryPartyId,
    poRaw: 'poRaw' in table ? table.poRaw : sql<string | null>`null::text`.as('po_raw'),
    itemCodeRaw: table.itemCodeRaw,
    barcodeRaw: 'barcodeRaw' in table ? table.barcodeRaw : sql<string | null>`null::text`.as('barcode_raw'),
    linkReason: table.linkReason,
  }).from(table).where(and(
    notInArray(table.linkStatus, ['linked', 'manual']),
    isNull(table.linkedOrderLineId),
    scopeWhere(kind, scope),
  ));
}

function scopeWhere(kind: FactoryReportKind, scope: Scope): SQL | undefined {
  if (scope.kind === 'all') return undefined;
  const table = REPORT_TABLES[kind];
  if (scope.kind === 'historical') return notInArray(table.importBatchId, scope.activeIds);
  return and(inArray(table.importBatchId, scope.activeIds), not(actionableFactoryReport(kind, table.linkStatus)));
}

function diagnosticView({ linkReason, ...row }: Omit<UnmatchedFactoryRowView, 'reason' | 'suggestedAction'> & { readonly linkReason: string | null }): UnmatchedFactoryRowView {
  const reason = linkReason ?? 'NO_CANDIDATE_LINE';
  return { ...row, reason, suggestedAction: suggestedActionOf(reason) };
}

function suggestedActionOf(reason: string): string {
  if (reason === 'FACTORY_LINK_CONFLICT') return '按 PO、品号、条码人工选定订单行';
  if (reason === 'LINE_LINK_IS_MANUAL') return '检查订单行的手工工厂关联';
  if (reason === 'NO_FACTORY_ROW_MATCH') return '补工厂进度行或人工挂接';
  return '补订单行或人工挂接';
}
