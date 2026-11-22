import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { devAuth } from '@sw/auth';
import { localDate } from '@sw/domain';
import { createDb, followUpQueries, migrate, schema, seed, timelineQueries, userDirectory, type AppDatabase } from '@sw/persistence';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import { composeFollowUp, followUpAttachmentMaxBytes } from '../src/composition/follow-up.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerFollowUpRoutes } from '../src/http/follow-up/routes.js';
import { loginAs } from './helpers/server.js';

const at = '2026-10-13T00:00:00.000Z';
const stamp = { createdAt: at, updatedAt: at };
let db: AppDatabase;
let closeDb: () => Promise<void>;
let queries: ReturnType<typeof followUpQueries>;

beforeAll(async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  db = handle.db;
  closeDb = () => handle.close();
  await seedPair(db);
  queries = followUpQueries({ db, clock: new FixedClock(at), timeZone: 'Asia/Shanghai' });
});

afterAll(async () => { await closeDb(); });

it('lane 只返回该线', async () => { expect(await ids({ lane: 'finished' })).toEqual(['line-a']); });
it('q 按品名、编码、条码、单号筛选', async () => { expect(await ids({ q: 'alpha' })).toEqual(['line-a']); expect(await ids({ q: 'C2' })).toEqual(['line-b']); });
it('supplierPartyId 只返回该供应商', async () => { expect(await ids({ supplierPartyId: 'sup-a' })).toEqual(['line-a']); });
it('receiverPartyId 只返回该收货方', async () => { expect(await ids({ receiverPartyId: 'recv-b' })).toEqual(['line-b']); });
it('buyer 按我、未分配、指定人筛选', async () => {
  const mine = { buyer: { kind: 'me' as const }, actorUserId: 'buyer-a' };
  expect(await ids(mine)).toEqual(['line-a']);
  expect(await ids({ buyer: { kind: 'unassigned' } })).toEqual(['line-b']);
  expect(await ids({ buyer: { kind: 'user', userId: 'buyer-a' } })).toEqual(['line-a']);
});
it('stages 只返回这些阶段', async () => { expect(await ids({ stages: ['no_batch'] })).toEqual(['line-b']); });
it('statusReported 只返回快照里的总表状态', async () => { expect(await ids({ statusReported: ['在产'] })).toEqual(['line-a']); });
it('overdueOnly 用冗余的下次到货日，没到期的不进', async () => { expect(await ids({ overdueOnly: true })).toEqual(['line-a']); });
it('hasOpenException 只返回有未关闭异常的行', async () => { expect(await ids({ hasOpenException: true })).toEqual(['line-a']); expect(await ids({ hasOpenException: false })).toEqual(['line-b']); });
it('missingInLatestImport 只命中 latestImportPresence 为 missing 的行', async () => {
  const page = await queries.list({ missingInLatestImport: true });
  expect(page.items.map((row) => row.id)).toEqual(['line-b']);
  expect(page.items[0]?.missingInLatestImport).toBe(true);
  expect(page.items[0]?.latestImportPresence).toBe('missing');
});
it('confirmedFrom 和 confirmedTo 用冗余确认日', async () => { expect(await ids({ confirmedFrom: localDate('2026-10-01'), confirmedTo: localDate('2026-10-15') })).toEqual(['line-a']); });
it('importBatchId 命中该导入碰过的行', async () => { expect(await ids({ importBatchId: 'imp-1' })).toEqual(['line-a']); });
it('导出用的查询不分页', async () => { expect(await ids({})).toEqual(['line-a', 'line-b']); });
it('summary 用与列表相同的筛选条件做聚合', async () => {
  const all = await queries.summary({});
  expect(all.total).toBe(2);
  expect(all.overdue).toBe(1);
  expect(all.dueToday).toBe(0);
  expect(all.missingDate).toBe(0);
  expect([...all.stages].sort((left, right) => left.stage.localeCompare(right.stage))).toEqual([
    { stage: 'awaiting_shipment', count: 1 },
    { stage: 'no_batch', count: 1 },
  ]);
  const material = await queries.summary({ lane: 'material' });
  expect(material.total).toBe(1);
  expect(material.overdue).toBe(0);
});

it('时间线游标翻页不重不漏', async () => {
  await seedTimeline(db);
  const timeline = timelineQueries(db);
  const first = await timeline.list('line-a');
  const second = await timeline.list('line-a', first.nextCursor ?? undefined);
  const seen = new Set([...first.events, ...second.events].map((event) => event.id));
  expect(first.events).toHaveLength(50);
  expect(first.nextCursor).not.toBeNull();
  expect(second.nextCursor).toBeNull();
  expect(seen.size).toBe(first.events.length + second.events.length);
  expect(seen.size).toBeGreaterThanOrEqual(51);
  const kinds = new Set([...first.events, ...second.events].map((event) => event.kind));
  expect(kinds.has('follow_up')).toBe(true);
  expect(kinds.has('exception')).toBe(true);
});

it('建批次后返回的是查询视图；第 11 秒撤销收货 409，作废后回到 shipped', async () => {
  const clock = new FixedClock(at);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-follow-'));
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const api = composeFollowUp({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai', clock });
  const app = await buildHttpApp({ auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }), register: (server) => registerFollowUpRoutes({ app: server, api, attachmentMaxBytes: followUpAttachmentMaxBytes() }) });
  const cookie = await loginAs(app, 'buyer');
  const line = await app.inject({ method: 'POST', url: '/api/v1/lines', headers: { cookie }, payload: { lane: 'finished', nameRaw: '面膜', qtyOrdered: 10, receiverPartyId: 'recv-flow' } });
  const lineId = lineIdOf(line.json());
  const created = await app.inject({ method: 'POST', url: `/api/v1/lines/${lineId}/batches`, headers: { cookie }, payload: { plannedQty: 10, receiverPartyId: 'recv-flow', dateBuyerConfirmed: '2026-10-20' } });
  const detail = await app.inject({ method: 'GET', url: `/api/v1/lines/${lineId}`, headers: { cookie } });
  expect(created.statusCode).toBe(200);
  expect(created.json()).toEqual(detail.json().batches[0]);
  expect(created.json().status).toBe('confirmed');
  const batchId = idOf(created.json());
  await app.inject({ method: 'POST', url: `/api/v1/batches/${batchId}/shipments`, headers: { cookie }, payload: { qty: 10, shippedOn: '2026-10-18' } });
  const receipt = await app.inject({ method: 'POST', url: `/api/v1/batches/${batchId}/receipts`, headers: { cookie }, payload: { qty: 1, receivedOn: '2026-10-19', category: 'finished' } });
  clock.advance(11);
  const undo = await app.inject({ method: 'DELETE', url: `/api/v1/receipts/${receipt.json().id}`, headers: { cookie } });
  expect(undo.statusCode).toBe(409);
  expect(undo.json().error.code).toBe('UNDO_WINDOW_EXPIRED');
  const voided = await app.inject({ method: 'POST', url: `/api/v1/receipts/${receipt.json().id}/void`, headers: { cookie }, payload: { reason: '记错了' } });
  expect(voided.statusCode).toBe(200);
  const after = await app.inject({ method: 'GET', url: `/api/v1/lines/${lineId}`, headers: { cookie } });
  expect(after.json().batches[0].status).toBe('shipped');
  const received = await app.inject({ method: 'POST', url: `/api/v1/batches/${batchId}/receipts`, headers: { cookie }, payload: { qty: 10, receivedOn: '2026-10-20', category: 'finished' } });
  expect(received.statusCode).toBe(200);
  const patched = await app.inject({ method: 'PATCH', url: `/api/v1/batches/${batchId}`, headers: { cookie }, payload: { dateBuyerConfirmed: '2026-10-21', reason: '到货后不应改期' } });
  expect(patched.statusCode).toBe(200);
  expect(patched.json().dateBuyerConfirmed).toBe('2026-10-21');
  expect(patched.json().status).toBe('received');
  expect(patched.json().firstConfirmedDate).toBe('2026-10-20');
  expect(patched.json().receipts).toHaveLength(2);
  expect(patched.json().receipts).toEqual(expect.arrayContaining([
    expect.objectContaining({ qty: 1, receivedOn: '2026-10-19' }),
    expect.objectContaining({ qty: 10, receivedOn: '2026-10-20' }),
  ]));
  const listed = await app.inject({ method: 'GET', url: '/api/v1/lines', headers: { cookie } });
  expect(listed.json().page).toMatchObject({ page: 1, pageSize: 50 });
  expect(listed.json().items.length).toBeLessThanOrEqual(50);
  const tooBig = await app.inject({ method: 'GET', url: '/api/v1/lines?pageSize=201', headers: { cookie } });
  expect(tooBig.statusCode).toBe(400);
  await app.close();
  await handle.close();
  await rm(uploadDir, { recursive: true });
});

async function ids(query: Parameters<typeof queries.list>[0]): Promise<string[]> {
  return (await queries.list(query)).items.map((row) => row.id);
}

async function seedPair(database: AppDatabase) {
  await database.insert(schema.parties).values([
    { ...stamp, id: 'sup-a', displayName: '甲厂', isSupplier: true, isFactory: true, isOwnWarehouse: false, note: null },
    { ...stamp, id: 'sup-b', displayName: '乙厂', isSupplier: true, isFactory: false, isOwnWarehouse: false, note: null },
    { ...stamp, id: 'recv-a', displayName: '甲仓', isSupplier: false, isFactory: false, isOwnWarehouse: true, note: null },
    { ...stamp, id: 'recv-b', displayName: '乙仓', isSupplier: false, isFactory: false, isOwnWarehouse: true, note: null },
  ]);
  await database.insert(schema.users).values({ ...stamp, id: 'buyer-a', name: '采购甲', roles: ['buyer'], feishuOpenId: null, active: true });
  await database.insert(schema.purchaseOrders).values([
    order({ id: 'po-a', poRaw: 'PO-A', supplierPartyId: 'sup-a', lane: 'finished' }),
    order({ id: 'po-b', poRaw: 'PO-B', supplierPartyId: 'sup-b', lane: 'material' }),
  ]);
  await database.insert(schema.orderLines).values([
    line({ id: 'line-a', purchaseOrderId: 'po-a', lane: 'finished', nameRaw: 'alpha', itemCodeRaw: 'C1', barcodeRaw: 'B1', buyerUserId: 'buyer-a', receiverPartyId: 'recv-a', stage: 'awaiting_shipment', nextDueDate: '2026-10-01', missingInLatestImport: false, currentSnapshotId: 'snap-1' }),
    line({ id: 'line-b', purchaseOrderId: 'po-b', lane: 'material', nameRaw: 'beta', itemCodeRaw: 'C2', barcodeRaw: 'B2', buyerUserId: null, receiverPartyId: 'recv-b', stage: 'no_batch', nextDueDate: '2026-11-01', missingInLatestImport: true, latestImportPresence: 'missing', currentSnapshotId: null }),
  ]);
  await database.insert(schema.orderLineSnapshots).values({ id: 'snap-1', orderLineId: 'line-a', importBatchId: 'imp-1', importRowId: 'row-1', data: { statusReported: { raw: '在产', value: '在产' } } });
  await database.insert(schema.exceptions).values({ ...stamp, id: 'ex-1', orderLineId: 'line-a', batchId: null, type: 'delay', note: '晚了', status: 'open', openedBy: 'buyer-a', closedBy: null, closedAt: null, closeNote: null });
  await database.insert(schema.followUps).values({ ...stamp, id: 'fu-1', orderLineId: 'line-a', batchId: null, kind: 'call', text: '催了', partyId: null, createdBy: 'buyer-a' });
}

function order(input: { readonly id: string; readonly poRaw: string; readonly supplierPartyId: string; readonly lane: string }) {
  return { ...stamp, id: input.id, poRaw: input.poRaw, poNorm: input.poRaw, poFormat: 'OTHER', relatedPoRaws: [], supplierPartyId: input.supplierPartyId, supplierRaw: input.poRaw, lane: input.lane, oaDemandRef: null };
}

function line(input: { readonly id: string; readonly purchaseOrderId: string; readonly lane: string; readonly nameRaw: string; readonly itemCodeRaw: string; readonly barcodeRaw: string; readonly buyerUserId: string | null; readonly receiverPartyId: string; readonly stage: string; readonly nextDueDate: string; readonly missingInLatestImport: boolean; readonly latestImportPresence?: string; readonly currentSnapshotId: string | null }) {
  return { ...stamp, ...input, itemId: null, qtyOrdered: '10', unit: null, origin: 'manual', candidateKey: null, cancelledAt: null, cancelReason: null, stageChangedAt: at, nextDueBatchId: `${input.id}-due` };
}

function lineIdOf(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.line) || typeof value.line.id !== 'string') throw new Error('没有订单行');
  return value.line.id;
}

function idOf(value: unknown): string {
  if (!isRecord(value) || typeof value.id !== 'string') throw new Error('没有编号');
  return value.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function seedTimeline(database: AppDatabase) {
  await database.insert(schema.deliveryBatches).values({ ...stamp, id: 'batch-a', orderLineId: 'line-a', seq: 1, plannedQty: '10', receiverPartyId: 'recv-a', dateFactoryRequired: null, dateSupplierPromised: null, dateBuyerConfirmed: '2026-10-01', firstConfirmedDate: '2026-10-01', confirmedBy: 'buyer-a', confirmedAt: at, status: 'confirmed', statusChangedAt: at, origin: 'manual', originRef: null, closedAt: null, closedReason: null, cancelledAt: null, cancelReason: null });
  const changes = Array.from({ length: 51 }, (_, index) => ({ id: `change-${index}`, batchId: 'batch-a', field: 'dateBuyerConfirmed', oldValue: '2026-10-01', newValue: '2026-10-02', reason: '改期', changedBy: 'buyer-a', changedAt: new Date(Date.parse('2026-01-01T00:00:00.000Z') + index * 60_000).toISOString() }));
  await database.insert(schema.batchDateChanges).values(changes);
}
