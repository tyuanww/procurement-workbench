import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { devAuth } from '@sw/auth';
import { createDb, migrate, schema, seed, userDirectory, type AppDatabase } from '@sw/persistence';
import { composeFollowUp, followUpAttachmentMaxBytes } from '../src/composition/follow-up.js';
import { composePerformance } from '../src/composition/performance.js';
import { composeToday } from '../src/composition/today.js';
import { buildHttpApp, type HttpApp } from '../src/http/app.js';
import { registerFollowUpRoutes } from '../src/http/follow-up/routes.js';
import { registerPerformanceRoutes } from '../src/http/performance/routes.js';
import { registerTodayRoutes } from '../src/http/today/routes.js';
import { loginAs } from './helpers/server.js';

const BUYER = '0199f0a0-0000-7000-8000-000000000002';
const WAREHOUSE = '0199f0a0-0000-7000-8000-000000000010';
const AT = '2026-10-12T00:00:00.000Z';

it('缺采购单仍显示品名，认不出的枚举不让整页失败', async () => {
  const opened = await open();
  const cookie = await loginAs(opened.app, 'buyer');
  const dashboardCookie = await loginAs(opened.app, 'manager');
  const good = await lineWithBatch({ app: opened.app, cookie, nameRaw: '好订单' });
  const orphan = await lineWithBatch({ app: opened.app, cookie, nameRaw: '缺采购单' });
  await opened.exec(`delete from purchase_orders where id = (select purchase_order_id from order_lines where id = '${orphan.lineId}')`);
  await insertOddLine(opened.db, { poId: 'po-bad-format', lineId: 'line-bad-format', poFormat: 'NOT_A_FORMAT', lane: 'finished', stage: 'awaiting_shipment', name: '坏格式' });
  await insertOddLine(opened.db, { poId: 'po-bad-lane', lineId: 'line-bad-lane', poFormat: 'OTHER', lane: 'bogus', stage: 'awaiting_shipment', name: '坏线路' });
  await insertOddLine(opened.db, { poId: 'po-bad-stage', lineId: 'line-bad-stage', poFormat: 'OTHER', lane: 'finished', stage: 'bogus', name: '坏阶段' });
  const today = await opened.app.inject({ method: 'GET', url: '/api/v1/today?scope=mine', headers: { cookie } });
  expect(today.statusCode).toBe(200);
  const items = itemsOf(today.json());
  expect(nameOf(items, good.batchId)).toBe('好订单');
  expect(nameOf(items, orphan.batchId)).toBe('缺采购单');
  expect(items.some((item) => item.line?.nameRaw === '坏格式' || item.line?.nameRaw === '坏线路')).toBe(false);
  const buyers = await opened.app.inject({ method: 'GET', url: '/api/v1/dashboard/buyers?from=2026-10-01&to=2026-11-30', headers: { cookie: dashboardCookie } });
  expect(buyers.statusCode).toBe(200);
  expect(openLinesOf(buyers.json(), BUYER)).toBe(3);
  await opened.close();
});

async function open() {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-today-gaps-'));
  const follow = composeFollowUp({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai' });
  const todayApi = composeToday({ db: handle.db, timeZone: 'Asia/Shanghai' });
  const performance = composePerformance({ db: handle.db, timeZone: 'Asia/Shanghai' });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => {
      registerFollowUpRoutes({ app: server, api: follow, attachmentMaxBytes: followUpAttachmentMaxBytes() });
      registerTodayRoutes(server, todayApi);
      registerPerformanceRoutes(server, performance);
    },
  });
  return {
    app,
    db: handle.db,
    exec: handle.exec,
    close: async () => {
      await app.close();
      await handle.close();
      await rm(uploadDir, { recursive: true });
    },
  };
}

async function lineWithBatch(input: { readonly app: HttpApp; readonly cookie: string; readonly nameRaw: string }): Promise<{ readonly lineId: string; readonly batchId: string }> {
  const created = await input.app.inject({
    method: 'POST',
    url: '/api/v1/lines',
    headers: { cookie: input.cookie },
    payload: { lane: 'finished', nameRaw: input.nameRaw, qtyOrdered: 10, receiverPartyId: WAREHOUSE, buyerUserId: BUYER },
  });
  expect(created.statusCode).toBe(200);
  const lineId = lineIdOf(created.json());
  const batch = await input.app.inject({
    method: 'POST',
    url: `/api/v1/lines/${lineId}/batches`,
    headers: { cookie: input.cookie },
    payload: { plannedQty: 10, receiverPartyId: WAREHOUSE, dateBuyerConfirmed: '2026-10-01' },
  });
  expect(batch.statusCode).toBe(200);
  return { lineId, batchId: idOf(batch.json()) };
}

async function insertOddLine(db: AppDatabase, input: { readonly poId: string; readonly lineId: string; readonly poFormat: string; readonly lane: string; readonly stage: string; readonly name: string }): Promise<void> {
  const stamp = { createdAt: AT, updatedAt: AT };
  await db.insert(schema.purchaseOrders).values({
    ...stamp,
    id: input.poId,
    poRaw: input.poId,
    poNorm: input.poId,
    poFormat: input.poFormat,
    relatedPoRaws: [],
    supplierPartyId: null,
    supplierRaw: null,
    lane: 'finished',
    oaDemandRef: null,
  });
  await db.insert(schema.orderLines).values({
    ...stamp,
    id: input.lineId,
    purchaseOrderId: input.poId,
    lane: input.lane,
    itemId: null,
    itemCodeRaw: null,
    barcodeRaw: null,
    nameRaw: input.name,
    qtyOrdered: '10',
    unit: null,
    buyerUserId: BUYER,
    receiverPartyId: WAREHOUSE,
    origin: 'manual',
    currentSnapshotId: null,
    candidateKey: null,
    missingInLatestImport: false,
    cancelledAt: null,
    cancelReason: null,
    stage: input.stage,
    stageChangedAt: AT,
    nextDueBatchId: null,
    nextDueDate: null,
  });
}

type TodayItem = {
  readonly refs: { readonly batchId?: string };
  readonly line: { readonly nameRaw: string | null } | null;
};

function itemsOf(value: unknown): readonly TodayItem[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return [];
  return value.items.flatMap(todayItem);
}

function todayItem(value: unknown): TodayItem[] {
  if (!isRecord(value) || !isRecord(value.refs)) return [];
  const batchId = typeof value.refs.batchId === 'string' ? value.refs.batchId : undefined;
  const line = isRecord(value.line) && (typeof value.line.nameRaw === 'string' || value.line.nameRaw === null)
    ? { nameRaw: value.line.nameRaw }
    : null;
  return [{ refs: batchId === undefined ? {} : { batchId }, line }];
}

function nameOf(items: readonly TodayItem[], batchId: string): string | null {
  return items.find((item) => item.refs.batchId === batchId)?.line?.nameRaw ?? null;
}

function openLinesOf(value: unknown, buyerId: string): number | null {
  if (!isRecord(value) || !Array.isArray(value.rows)) return null;
  for (const row of value.rows) {
    if (!isRecord(row) || !isRecord(row.buyer) || row.buyer.id !== buyerId) continue;
    return typeof row.openLines === 'number' ? row.openLines : null;
  }
  return null;
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
