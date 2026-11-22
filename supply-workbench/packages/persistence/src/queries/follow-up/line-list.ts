import { and, eq, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { LinesQuery, LineSummary, OrderLineRow } from '@sw/application';
import { ValidationFailedError } from '@sw/application/errors';
import { LINE_STAGES, type LocalDate } from '@sw/domain';
import type { ListResult } from '../../../../application/src/shared/page.js';
import type { AppDatabase } from '../../client.js';
import { orderLines, purchaseOrders } from '../../schema/orders.js';
import { storeFilter } from '../store-progress/scope.js';
import { storeProgressOf } from '../store-progress/rows.js';
import { inTransitFactoryWhere } from './line-in-transit.js';
import { loadRelations, toRow } from './line-row.js';

const PAGE_MAX = 200;
const SORT_FIELDS = ['stage', 'nextDueDate', 'nameRaw', 'qtyOrdered', 'createdAt', 'daysInStage'] as const;

type SortField = (typeof SORT_FIELDS)[number];
type Sort = { readonly field: SortField; readonly desc: boolean };
type Clock = { today(): LocalDate; now(): string };
type Read = { readonly db: AppDatabase; readonly clock: Clock; readonly timeZone: string };
type Line = typeof orderLines.$inferSelect;

export async function listLines(read: Read, query: LinesQuery): Promise<ListResult<OrderLineRow>> {
  const sorts = sortsOf(query.sort);
  const where = await whereForRead({ db: read.db, query, today: read.clock.today() });
  if (query.pageSize === undefined) return unpaged({ read, where, sorts, store: query.store });
  const page = query.page ?? 1;
  assertPage(page, query.pageSize);
  const total = await countLines(read.db, where);
  const lines = await selectLines(read.db, { where, sorts, page: { limit: query.pageSize, offset: (page - 1) * query.pageSize } });
  return { items: await rowsOf(read, { lines, store: query.store }), page: { page, pageSize: query.pageSize, total } };
}

export async function summarizeLines(read: Read, query: LinesQuery): Promise<LineSummary> {
  const today = read.clock.today();
  const where = await whereForRead({ db: read.db, query, today });
  const [total, stages, counts] = await Promise.all([countLines(read.db, where), stageCounts(read.db, where), summaryCounts({ db: read.db, where, today })]);
  return { total, ...counts, stages };
}

async function stageCounts(db: AppDatabase, where: SQL | undefined): Promise<readonly { readonly stage: LineSummary['stages'][number]['stage']; readonly count: number }[]> {
  const rows = await db.select({ stage: orderLines.stage, count: sql<number>`count(*)::int` }).from(orderLines).innerJoin(purchaseOrders, eq(orderLines.purchaseOrderId, purchaseOrders.id)).where(where).groupBy(orderLines.stage);
  return rows.flatMap((row) => { const stage = LINE_STAGES.find((item) => item === row.stage); return stage === undefined ? [] : [{ stage, count: Number(row.count) }]; });
}

async function summaryCounts(input: { readonly db: AppDatabase; readonly where: SQL | undefined; readonly today: LocalDate }): Promise<Pick<LineSummary, 'overdue' | 'dueToday' | 'missingDate'>> {
  const { db, where, today } = input;
  const active = sql`${orderLines.stage} not in ('done', 'cancelled')`;
  const rows = await db.select({
    overdue: sql<number>`count(*) filter (where ${orderLines.nextDueDate} is not null and ${orderLines.nextDueDate} < ${today} and ${active})::int`,
    dueToday: sql<number>`count(*) filter (where ${orderLines.nextDueDate} = ${today} and ${active})::int`,
    missingDate: sql<number>`count(*) filter (where ${orderLines.stage} = 'awaiting_date')::int`,
  }).from(orderLines).innerJoin(purchaseOrders, eq(orderLines.purchaseOrderId, purchaseOrders.id)).where(where);
  const row = rows[0];
  if (row === undefined) throw new Error('订单行汇总失败');
  return { overdue: countOf(row.overdue), dueToday: countOf(row.dueToday), missingDate: countOf(row.missingDate) };
}

async function unpaged({ read, where, sorts, store }: { readonly read: Read; readonly where: SQL | undefined; readonly sorts: readonly Sort[]; readonly store: LinesQuery['store'] }): Promise<ListResult<OrderLineRow>> {
  const lines = await selectLines(read.db, { where, sorts });
  return { items: await rowsOf(read, { lines, store }), page: { page: 1, pageSize: lines.length, total: lines.length } };
}

async function rowsOf(read: Read, { lines, store }: { readonly lines: readonly Line[]; readonly store: LinesQuery['store'] }): Promise<OrderLineRow[]> {
  const [world, progress] = await Promise.all([
    loadRelations(read.db, lines),
    store === undefined ? undefined : storeProgressOf(read.db, lines.filter((line) => line.lane === 'finished').map((line) => line.id)),
  ]);
  return lines.map((line) => {
    const row = toRow({ line, world, clock: read.clock, timeZone: read.timeZone });
    const storeProgress = progress?.get(line.id);
    return storeProgress === undefined ? row : { ...row, storeProgress };
  });
}

function joined(db: AppDatabase, where: SQL | undefined) {
  return db.select({ line: orderLines }).from(orderLines).innerJoin(purchaseOrders, eq(orderLines.purchaseOrderId, purchaseOrders.id)).where(where);
}

async function selectLines(db: AppDatabase, input: { readonly where: SQL | undefined; readonly sorts: readonly Sort[]; readonly page?: { readonly limit: number; readonly offset: number } }): Promise<Line[]> {
  const base = joined(db, input.where).orderBy(...sortSql(input.sorts));
  const rows = input.page === undefined ? await base : await base.limit(input.page.limit).offset(input.page.offset);
  return rows.map((row) => row.line);
}

async function countLines(db: AppDatabase, where: SQL | undefined): Promise<number> {
  const counted = await db.select({ total: sql<number>`count(*)::int` }).from(orderLines).innerJoin(purchaseOrders, eq(orderLines.purchaseOrderId, purchaseOrders.id)).where(where);
  const total = Number(counted[0]?.total);
  if (!Number.isInteger(total)) throw new Error('订单行计数失败');
  return total;
}

function countOf(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && value !== '') {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  throw new Error('订单行汇总计数失败');
}

async function whereForRead({ db, query, today }: { readonly db: AppDatabase; readonly query: LinesQuery; readonly today: LocalDate }): Promise<SQL | undefined> {
  const where = whereOf({ query, today, actorId: actorUserId(query) });
  return query.inTransitFactory === undefined ? where : inTransitFactoryWhere({ db, factory: query.inTransitFactory, where });
}

function whereOf({ query, today, actorId }: { readonly query: LinesQuery; readonly today: LocalDate; readonly actorId: string | undefined }): SQL | undefined {
  const parts = [
    storeFilter({ store: query.store, line: orderLines.id, hasMaterialScope: query.lane !== 'finished' }),
    query.lane === undefined ? undefined : eq(orderLines.lane, query.lane),
    textOf(query.q),
    query.supplierPartyId === undefined ? undefined : eq(purchaseOrders.supplierPartyId, query.supplierPartyId),
    query.receiverPartyId === undefined ? undefined : eq(orderLines.receiverPartyId, query.receiverPartyId),
    buyerOf(query, actorId),
    stagesOf(query),
    statusOf(query.statusReported),
    query.overdueOnly === true ? and(isNotNull(orderLines.nextDueDate), lt(orderLines.nextDueDate, today)) : undefined,
    exceptionOf(query.hasOpenException),
    missingClause(query.missingInLatestImport),
    confirmedOf(query),
    importOf(query.importBatchId),
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? undefined : and(...parts);
}

function missingClause(isMissing: boolean | undefined): SQL | undefined {
  if (isMissing === undefined) return undefined;
  return isMissing ? eq(orderLines.latestImportPresence, 'missing') : ne(orderLines.latestImportPresence, 'missing');
}

function textOf(q: string | undefined): SQL | undefined {
  if (q === undefined || q === '') return undefined;
  const needle = `%${escapeLike(q)}%`;
  return or(ilike(orderLines.nameRaw, needle), ilike(orderLines.itemCodeRaw, needle), ilike(orderLines.barcodeRaw, needle), ilike(purchaseOrders.poRaw, needle));
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function buyerOf(query: LinesQuery, actorId: string | undefined): SQL | undefined {
  const buyer = query.buyer;
  if (buyer === undefined) return undefined;
  if (buyer.kind === 'unassigned') return isNull(orderLines.buyerUserId);
  if (buyer.kind === 'user') return eq(orderLines.buyerUserId, buyer.userId);
  return actorId === undefined ? sql`false` : eq(orderLines.buyerUserId, actorId);
}

function stagesOf(query: LinesQuery): SQL | undefined {
  if (query.stages === undefined) return undefined;
  if (query.stages.length === 0) return sql`false`;
  return inArray(orderLines.stage, [...query.stages]);
}

function statusOf(wanted: readonly string[] | undefined): SQL | undefined {
  if (wanted === undefined) return undefined;
  if (wanted.length === 0) return sql`false`;
  const values = sql.join(wanted.map((item) => sql`${item}`), sql`, `);
  return sql`exists (select 1 from order_line_snapshots s where s.id = ${orderLines.currentSnapshotId} and s.data->'statusReported'->>'value' in (${values}) and s.data->'statusReported'->>'value' <> '')`;
}

function exceptionOf(wanted: boolean | undefined): SQL | undefined {
  if (wanted === undefined) return undefined;
  const open = sql`exists (select 1 from exceptions e where e.order_line_id = ${orderLines.id} and e.status = 'open')`;
  return wanted ? open : sql`not (${open})`;
}

function confirmedOf(query: LinesQuery): SQL | undefined {
  if (query.confirmedFrom === undefined && query.confirmedTo === undefined) return undefined;
  const parts = [
    isNotNull(orderLines.nextDueDate),
    query.confirmedFrom === undefined ? undefined : gte(orderLines.nextDueDate, query.confirmedFrom),
    query.confirmedTo === undefined ? undefined : lte(orderLines.nextDueDate, query.confirmedTo),
  ].filter((part) => part !== undefined);
  return and(...parts);
}

function importOf(importBatchId: string | undefined): SQL | undefined {
  if (importBatchId === undefined) return undefined;
  return sql`exists (select 1 from order_line_snapshots s where s.order_line_id = ${orderLines.id} and s.import_batch_id = ${importBatchId})`;
}

function actorUserId(query: LinesQuery): string | undefined {
  const record: Record<string, unknown> = { ...query };
  return typeof record.actorUserId === 'string' ? record.actorUserId : undefined;
}

function sortsOf(sort: string | undefined): readonly Sort[] {
  if (sort === undefined || sort === '') return [{ field: 'nextDueDate', desc: false }, { field: 'createdAt', desc: true }];
  return sort.split(',').filter((part) => part !== '').map(oneSort);
}

function oneSort(part: string): Sort {
  const [field, direction] = part.split(':');
  if (!isSortField(field) || (direction !== 'asc' && direction !== 'desc')) throw new ValidationFailedError('不认识的排序', { field: part });
  return { field, desc: direction === 'desc' };
}

function isSortField(value: string | undefined): value is SortField {
  return SORT_FIELDS.some((field) => field === value);
}

function sortSql(sorts: readonly Sort[]): SQL[] {
  return [...sorts.map(oneOrder), sql`${orderLines.id} asc`];
}

function oneOrder(sort: Sort): SQL {
  const isDescending = sort.field === 'daysInStage' ? !sort.desc : sort.desc;
  return sql`${columnOf(sort.field)} ${isDescending ? sql`desc` : sql`asc`} nulls last`;
}

function columnOf(field: SortField) {
  if (field === 'stage') return orderLines.stage;
  if (field === 'daysInStage') return orderLines.stageChangedAt;
  if (field === 'nextDueDate') return orderLines.nextDueDate;
  if (field === 'nameRaw') return orderLines.nameRaw;
  if (field === 'qtyOrdered') return orderLines.qtyOrdered;
  return orderLines.createdAt;
}

function assertPage(page: number, pageSize: number): void {
  if (!Number.isInteger(page) || page < 1) throw new ValidationFailedError('页码不合法', { field: 'page' });
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_MAX) throw new ValidationFailedError('每页条数不合法', { field: 'pageSize' });
}
