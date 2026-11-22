import { expect, it } from 'vitest';
import { OrderLineDetailSchema } from '@sw/contracts';
import type { AppHandle } from '@sw/persistence';
import type { HttpApp } from '../src/http/app.js';
import { loginAs } from './helpers/server.js';
import { createLine, lineIdOf, open, RECEIVER, today } from './helpers/today.js';

const BUYER = '0199f0a0-0000-7000-8000-000000000002';
const OTHER_BUYER = '0199f0a0-0000-7000-8000-000000000003';
const WAREHOUSE = '0199f0a0-0000-7000-8000-000000000010';

it('我的今日显示待建首批次的订单行，创建后移出清单', async () => {
  const opened = await open();
  try {
    const { app } = opened;
    const buyer = await loginAs(app, 'buyer');
    const reviewer = await loginAs(app, 'reviewer');
    const manager = await loginAs(app, 'manager');
    const created = await app.inject({
      method: 'POST', url: '/api/v1/lines', headers: { cookie: buyer },
      payload: { lane: 'material', poRaw: 'SYN-PENDING', nameRaw: '合成盖样品', qtyOrdered: 120, unit: '件', receiverPartyId: WAREHOUSE, buyerUserId: BUYER },
    });
    expect(created.statusCode).toBe(200);
    const orderLineId = lineIdOf(created.json());
    expect(await today({ app, cookie: buyer, scope: 'mine' })).not.toHaveProperty('pendingBatch');
    const mine = await today({ app, cookie: buyer, scope: 'mine', includePending: true });
    expect(mine.pendingBatch).toEqual([{ orderLineId, poRaw: 'SYN-PENDING', nameRaw: '合成盖样品', qtyOrdered: 120, unit: '件', missingFields: [], action: 'create' }]);
    expect(mine.items).toEqual([]);
    expect(mine.arrivalMemos).toEqual([]);
    expect((await today({ app, cookie: reviewer, scope: 'mine', includePending: true })).pendingBatch).toEqual([]);
    expect((await today({ app, cookie: reviewer, scope: 'all', includePending: true })).pendingBatch).toEqual([]);
    expect((await today({ app, cookie: manager, scope: 'all', includePending: true })).pendingBatch).toMatchObject([{ orderLineId, action: 'detail' }]);
    const otherBuyer = await buyerCookie(app, OTHER_BUYER);
    expect((await today({ app, cookie: otherBuyer, scope: 'all', includePending: true })).pendingBatch).toEqual([]);
    expect((await hint({ app, cookie: otherBuyer, lineIds: [orderLineId] })).json()).toEqual({ created: 0, skipped: [{ lineId: orderLineId, reason: '订单行不存在' }] });

    const first = await hint({ app, cookie: buyer, lineIds: [orderLineId] });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ created: 1, skipped: [] });
    expect((await today({ app, cookie: buyer, scope: 'mine', includePending: true })).pendingBatch).toEqual([]);
    expect((await hint({ app, cookie: buyer, lineIds: [orderLineId] })).json()).toEqual({ created: 0, skipped: [{ lineId: orderLineId, reason: '已有批次' }] });
    const detail = OrderLineDetailSchema.parse((await app.inject({ url: `/api/v1/lines/${orderLineId}`, headers: { cookie: buyer } })).json());
    expect(detail.batches).toMatchObject([{ seq: 1, plannedQty: 120, fulfillment: { unit: '件' } }]);
  } finally {
    await opened.close();
  }
});

it('待建批次保留最近未出现的订单，识别缺值与完成状态，旧批量行为独立', async () => {
  const opened = await open();
  try {
    const { app, exec } = opened;
    const buyer = await loginAs(app, 'buyer');
    const missing = await createLine({ app, cookie: buyer, buyerUserId: BUYER });
    const completed = await createLine({ app, cookie: buyer, buyerUserId: BUYER });
    const cancelled = await createLine({ app, cookie: buyer, buyerUserId: BUYER });
    const unassigned = await createLine({ app, cookie: buyer, buyerUserId: undefined });
    const otherReceiver = await createLine({ app, cookie: buyer, buyerUserId: BUYER });
    await exec(`
      INSERT INTO parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse)
      VALUES ('${RECEIVER}', now(), now(), '合成代工厂', false, true, false);
      INSERT INTO order_line_snapshots (id, order_line_id, import_batch_id, import_row_id, data)
      VALUES ('completed-source', '${completed}', 'synthetic-import', 'synthetic-row', '{"statusReported":{"value":"已完成"}}');
      UPDATE order_lines SET current_snapshot_id = 'completed-source' WHERE id = '${completed}';
      UPDATE order_lines SET origin = 'import_po_master', latest_import_presence = 'missing', missing_in_latest_import = true,
        qty_ordered = null, unit = null, receiver_party_id = null WHERE id = '${missing}';
    `);
    expect((await app.inject({ method: 'POST', url: `/api/v1/lines/${cancelled}/cancel`, headers: { cookie: buyer }, payload: { reason: '取消合成订单' } })).statusCode).toBe(200);
    const pending = (await today({ app, cookie: buyer, scope: 'mine', includePending: true })).pendingBatch;
    expect(pending).toHaveLength(2);
    expect(pending).toEqual(expect.arrayContaining([
      expect.objectContaining({ orderLineId: otherReceiver, action: 'detail', missingFields: [] }),
      expect.objectContaining({ orderLineId: missing, qtyOrdered: null, unit: null, action: 'detail', missingFields: ['quantity', 'unit', 'receiver'] }),
    ]));
    expect((await hint({ app, cookie: buyer, lineIds: [missing, completed, cancelled, unassigned, otherReceiver] })).json()).toMatchObject({
      created: 0,
      skipped: [missing, completed, cancelled, unassigned, otherReceiver].map((lineId) => ({ lineId })),
    });

    const legacy = await app.inject({
      method: 'POST', url: '/api/v1/lines/bulk/hint-batches', headers: { cookie: buyer },
      payload: { lineIds: [completed], includeCompleted: true },
    });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json()).toEqual({ created: 1, skipped: [] });

    const manual = await app.inject({
      method: 'POST', url: `/api/v1/lines/${missing}/batches`, headers: { cookie: buyer },
      payload: { firstBatchOnly: true, plannedQty: 120, receiverPartyId: WAREHOUSE },
    });
    expect(manual.statusCode).toBe(200);
    const corrected = await app.inject({
      method: 'PATCH', url: `/api/v1/batches/${idOf(manual.json())}`, headers: { cookie: buyer },
      payload: { plannedUnit: '个', reason: '合成采购凭证单位' },
    });
    expect(corrected.statusCode).toBe(200);
    expect(corrected.json()).toMatchObject({ fulfillment: { unit: '个' } });
    expect((await today({ app, cookie: buyer, scope: 'mine', includePending: true })).pendingBatch).toMatchObject([{ orderLineId: otherReceiver }]);
  } finally {
    await opened.close();
  }
});

it('同一个首批次的快捷与手工创建并发只写一批，仍可手工追加第二批', async () => {
  const opened = await open(undefined, concurrencyDatabase());
  try {
    const { app, exec } = opened;
    const buyer = await loginAs(app, 'buyer');
    const lineId = await createLine({ app, cookie: buyer, buyerUserId: BUYER });
    await exec(`UPDATE order_lines SET receiver_party_id = '${WAREHOUSE}' WHERE id = '${lineId}'`);
    const create = (firstBatchOnly: boolean) => app.inject({
      method: 'POST', url: `/api/v1/lines/${lineId}/batches`, headers: { cookie: buyer },
      payload: { firstBatchOnly, plannedQty: 3, receiverPartyId: WAREHOUSE },
    });
    const [quick, manual] = await raceAtOrderLine({ handle: opened.handle, lineId, run: () => Promise.all([hint({ app, cookie: buyer, lineIds: [lineId] }), create(true)]) });
    expect(quick.statusCode, quick.body).toBe(200);
    if (manual.statusCode === 200) {
      expect(quick.json()).toEqual({ created: 0, skipped: [{ lineId, reason: '已有批次' }] });
    } else {
      expect(manual.statusCode, manual.body).toBe(409);
      expect(manual.json()).toMatchObject({ error: { code: 'STATE_CONFLICT', details: { state: 'first_batch.exists' } } });
      expect(quick.json()).toEqual({ created: 1, skipped: [] });
    }
    const route = () => app.inject({ url: `/api/v1/lines/${lineId}`, headers: { cookie: buyer } });
    expect(OrderLineDetailSchema.parse((await route()).json()).batches.map(({ seq }) => seq)).toEqual([1]);
    expect((await create(false)).statusCode).toBe(200);
    expect(OrderLineDetailSchema.parse((await route()).json()).batches.map(({ seq }) => seq)).toEqual([1, 2]);
  } finally {
    await opened.close();
  }
});

it('设置指向仅有工厂角色的主体时今日走订单详情，旧跟进台批量仍可使用', async () => {
  const opened = await open();
  try {
    const { app, exec } = opened;
    const buyer = await loginAs(app, 'buyer');
    const lineId = await createLine({ app, cookie: buyer, buyerUserId: BUYER });
    await exec(`
      INSERT INTO parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse)
      VALUES ('${RECEIVER}', now(), now(), '合成工厂', false, true, false);
      UPDATE settings SET own_warehouse_party_id = '${RECEIVER}' WHERE id = 'default';
    `);
    const pending = (await today({ app, cookie: buyer, scope: 'mine', includePending: true })).pendingBatch;
    expect(pending).toMatchObject([{ orderLineId: lineId, action: 'detail', missingFields: [] }]);
    expect((await hint({ app, cookie: buyer, lineIds: [lineId] })).json()).toMatchObject({
      created: 0, skipped: [{ lineId, reason: '请在订单详情确认收货方' }],
    });
    const legacy = await app.inject({
      method: 'POST', url: '/api/v1/lines/bulk/hint-batches', headers: { cookie: buyer },
      payload: { lineIds: [lineId], includeCompleted: false },
    });
    expect(legacy.statusCode).toBe(200);
    expect(legacy.json()).toEqual({ created: 1, skipped: [] });
    const response = await app.inject({ url: `/api/v1/lines/${lineId}`, headers: { cookie: buyer } });
    expect(OrderLineDetailSchema.parse(response.json()).batches).toMatchObject([{ receiverPartyId: RECEIVER }]);
  } finally {
    await opened.close();
  }
});

async function raceAtOrderLine<T>({ handle, lineId, run }: { readonly handle: AppHandle; readonly lineId: string; readonly run: () => Promise<T> }): Promise<T> {
  if (handle.driver !== 'pg') return run();
  const session = await handle.session();
  try {
    await session.exec('BEGIN');
    await session.exec(`SELECT id FROM order_lines WHERE id = '${lineId}' FOR UPDATE`);
    const pending = run();
    try {
      await expect.poll(() => handle.exec(`
        SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query ILIKE '%"order_lines"%for update%'
      `)).toMatchObject({ rows: [{ waiting: 2 }] });
    } finally {
      await session.exec('ROLLBACK');
    }
    return await pending;
  } finally {
    session.release();
  }
}

function concurrencyDatabase(): string | undefined {
  const url = process.env.HZ08_TEST_DATABASE_URL;
  if (url === undefined) return undefined;
  const parsed = new URL(url);
  if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/hz08_proof') throw new Error('只允许使用 HZ08 一次性 PostgreSQL 测试库');
  return url;
}

function hint({ app, cookie, lineIds }: { readonly app: HttpApp; readonly cookie: string; readonly lineIds: readonly string[] }) {
  return app.inject({
    method: 'POST', url: '/api/v1/lines/bulk/hint-batches', headers: { cookie },
    payload: { lineIds, includeCompleted: false, source: 'today' },
  });
}

async function buyerCookie(app: HttpApp, userId: string): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId, accessCode: 'dev-code' } });
  expect(login.statusCode).toBe(200);
  return String(login.headers['set-cookie']).split(';')[0] ?? '';
}

function idOf(value: unknown): string {
  if (!isRecord(value) || typeof value.id !== 'string') throw new Error('没有编号');
  return value.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
