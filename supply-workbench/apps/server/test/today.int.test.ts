import { expect, it } from 'vitest';
import { OrderLineDetailSchema } from '@sw/contracts';
import { localDate } from '@sw/domain';
import type { HttpApp } from '../src/http/app.js';
import { loginAs } from './helpers/server.js';
import { createLine, open, RECEIVER, TODAY, today } from './helpers/today.js';

const BUYER = '0199f0a0-0000-7000-8000-000000000002';
const CSV_HEADER = 'OA需求编号,供应商,产品名称,产品条码,订单数量,OA提报时间,OA需求时间,计划时长,采购订单号,实际开始（半成品订单创建）,订单首批交付时间,实际结束（成品交付完成）,实际时长,工厂成品库存,实际发货数量,订单数量差额,状态';


it('02 第 8.2 节的每个原因该出现时出现，不该出现时不出现', async () => {
  const opened = await open();
  const buyer = await loginAs(opened.app, 'buyer');
  const reviewer = await loginAs(opened.app, 'reviewer');
  const assigned = await createLine({ app: opened.app, cookie: buyer, buyerUserId: BUYER });
  const openLine = await createLine({ app: opened.app, cookie: buyer, buyerUserId: undefined });
  const overdue = await batch({ app: opened.app, cookie: buyer, input: { lineId: assigned, dates: { dateBuyerConfirmed: '2099-01-01' } } });
  const demand = await batch({ app: opened.app, cookie: buyer, input: { lineId: assigned, dates: { dateFactoryRequired: '2099-01-01', dateBuyerConfirmed: '2099-01-08' } } });
  const due = await batch({ app: opened.app, cookie: buyer, input: { lineId: assigned, dates: { dateBuyerConfirmed: '2099-01-10' } } });
  const upcoming = await batch({ app: opened.app, cookie: buyer, input: { lineId: assigned, dates: { dateBuyerConfirmed: '2099-01-12' } } });
  const shipped = await batch({ app: opened.app, cookie: buyer, input: { lineId: assigned, dates: { dateBuyerConfirmed: '2099-06-01' } } });
  await opened.app.inject({ method: 'POST', url: `/api/v1/batches/${shipped}/shipments`, headers: { cookie: buyer }, payload: { qty: 1, shippedOn: '2099-01-09' } });
  const received = await batch({ app: opened.app, cookie: buyer, input: { lineId: assigned, dates: { dateBuyerConfirmed: '2099-06-01' } } });
  await opened.app.inject({ method: 'POST', url: `/api/v1/batches/${received}/shipments`, headers: { cookie: buyer }, payload: { qty: 10, shippedOn: '2099-01-09' } });
  await opened.app.inject({ method: 'POST', url: `/api/v1/batches/${received}/receipts`, headers: { cookie: buyer }, payload: { qty: 10, receivedOn: '2099-01-09', category: 'finished' } });
  const quiet = await batch({ app: opened.app, cookie: buyer, input: { lineId: assigned, dates: { dateBuyerConfirmed: '2099-06-01' } } });
  const cancelled = await batch({ app: opened.app, cookie: buyer, input: { lineId: assigned, dates: { dateBuyerConfirmed: '2099-01-01' } } });
  await opened.app.inject({ method: 'POST', url: `/api/v1/batches/${cancelled}/cancel`, headers: { cookie: buyer }, payload: { reason: '不要了' } });
  const missing = await batch({ app: opened.app, cookie: buyer, input: { lineId: openLine, dates: {} } });
  await opened.app.inject({ method: 'POST', url: '/api/v1/exceptions', headers: { cookie: buyer }, payload: { orderLineId: assigned, type: 'delay', note: '晚了' } });
  const closed = await opened.app.inject({ method: 'POST', url: '/api/v1/exceptions', headers: { cookie: buyer }, payload: { orderLineId: assigned, type: 'other', note: '已处理' } });
  await opened.app.inject({ method: 'POST', url: `/api/v1/exceptions/${closed.json().id}/close`, headers: { cookie: buyer }, payload: { closeNote: '好了' } });
  await startImport(opened.app, { cookie: buyer, fileName: 'pending.csv', row: 'OA9,另一个供应商,瓶子,6900000000002,1,,,,,,,,,,,,未开始' });
  await commitImport(opened.app, { cookie: buyer, fileName: 'review.csv', row: 'OA8,待审供应商,面霜,6900000000003,1,,,,,,,,,,,,未开始' });
  const mine = await today({ app: opened.app, cookie: buyer, scope: 'mine' });
  const reviewerMine = await today({ app: opened.app, cookie: reviewer, scope: 'mine' });
  const reviewerAll = await today({ app: opened.app, cookie: reviewer, scope: 'all' });
  expect(reasonsOf(mine, overdue)).toEqual(expect.arrayContaining(['overdue']));
  expect(reasonsOf(mine, demand)).toEqual(expect.arrayContaining(['demand_before_confirmed']));
  expect(reasonsOf(mine, due)).toEqual(['due_today', 'unshipped']);
  expect(reasonsOf(mine, upcoming)).toEqual(['upcoming', 'unshipped']);
  expect(reasonsOf(mine, shipped)).toEqual(['note_missing', 'fulfillment_review']);
  expect(reasonsOf(mine, received)).toEqual(['note_missing', 'fulfillment_review']);
  expect(mine.arrivalMemos).toEqual([]);
  expect(reasonsOf(mine, missing)).toEqual(expect.arrayContaining(['missing_date', 'unassigned']));
  expect(mine.items.some((item: { subject: string; reasons: string[] }) => item.subject === 'exception' && item.reasons.includes('exception_open'))).toBe(true);
  expect(mine.items.some((item: { reasons: string[] }) => item.reasons.includes('import_pending'))).toBe(true);
  expect(mine.items.some((item: { reasons: string[] }) => item.reasons.includes('review_pending'))).toBe(false);
  expect(batchIds(mine)).toContain(quiet);
  expect(batchIds(mine)).not.toContain(cancelled);
  expect(mine.items.some((item: { exception: { note: string } | null }) => item.exception?.note === '已处理')).toBe(false);
  expect(itemOf(mine, overdue)?.line?.nameRaw).toBe('今日样品');
  expect(itemOf(mine, overdue)?.batch).toMatchObject({ shippedQty: 0, receivedQty: 0, lastShippedOn: null });
  expect(itemOf(mine, shipped)?.batch).toMatchObject({ shippedQty: 1, receivedQty: 0, lastShippedOn: '2099-01-09' });
  expect(itemOf(mine, received)?.batch).toMatchObject({ shippedQty: 10, receivedQty: 10, lastShippedOn: '2099-01-09' });
  expect(reviewerMine.items.find((item: { subject: string }) => item.subject === 'review')).toMatchObject({ line: null, batch: null });
  expect(reviewerMine.items.some((item: { reasons: string[] }) => item.reasons.includes('review_pending'))).toBe(true);
  expect(reviewerMine.items.some((item: { refs: { batchId?: string } }) => item.refs.batchId === overdue)).toBe(false);
  expect(reviewerAll.items.some((item: { refs: { batchId?: string } }) => item.refs.batchId === overdue)).toBe(true);
  await opened.close();
});

it('订单负责人只接受有效账号，交接后待办转给接手人', async () => {
  const opened = await open();
  try {
    const app = opened.app;
    const buyer = await loginAs(app, 'buyer');
    const admin = await loginAs(app, 'admin');
    const reviewer = await loginAs(app, 'reviewer');
    const otherBuyer = '0199f0a0-0000-7000-8000-000000000003';
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: otherBuyer, accessCode: 'dev-code' } });
    expect(login.statusCode).toBe(200);
    const other = String(login.headers['set-cookie']).split(';')[0] ?? '';
    const lineId = await createLine({ app, cookie: buyer, buyerUserId: BUYER });
    const batchId = await batch({ app, cookie: buyer, input: { lineId, dates: {} } });
    const url = `/api/v1/lines/${lineId}`;
    const ownersUrl = '/api/v1/lines/owner-options';
    const candidates = await app.inject({ url: ownersUrl, headers: { cookie: buyer } });
    expect(candidates.json()).toEqual(expect.arrayContaining([{ id: otherBuyer, name: '采购乙' }]));
    expect((await app.inject({ url: ownersUrl, headers: { cookie: reviewer } })).statusCode).toBe(403);

    const unknown = '采购乙';
    for (const mutation of [
      { method: 'PATCH', url, payload: { buyerUserId: unknown } },
      { method: 'POST', url: '/api/v1/lines/bulk/assign', payload: { lineIds: [lineId], buyerUserId: unknown } },
      { method: 'POST', url: '/api/v1/lines', payload: { lane: 'finished', nameRaw: '无效分派', qtyOrdered: 1, receiverPartyId: RECEIVER, buyerUserId: unknown } },
    ] as const) {
      const rejected = await app.inject({ ...mutation, headers: { cookie: buyer } });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED', details: { field: 'buyerUserId' } } });
    }
    const rejectedRole = await app.inject({ method: 'PATCH', url, headers: { cookie: buyer }, payload: { buyerUserId: '0199f0a0-0000-7000-8000-000000000004' } });
    expect(rejectedRole.statusCode).toBe(400);
    expect(batchIds(await today({ app, cookie: buyer, scope: 'mine' }))).toContain(batchId);
    expect(batchIds(await today({ app, cookie: other, scope: 'mine' }))).not.toContain(batchId);

    const updated = await app.inject({ method: 'PATCH', url, headers: { cookie: buyer }, payload: { buyerUserId: otherBuyer } });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ line: { buyer: { id: otherBuyer } } });
    expect(batchIds(await today({ app, cookie: buyer, scope: 'mine' }))).not.toContain(batchId);
    expect(batchIds(await today({ app, cookie: other, scope: 'mine' }))).toContain(batchId);
    expect((await app.inject({ method: 'PATCH', url, headers: { cookie: buyer }, payload: { buyerUserId: BUYER } })).statusCode).toBe(403);

    const cleared = await app.inject({ method: 'PATCH', url, headers: { cookie: admin }, payload: { buyerUserId: null } });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({ line: { buyer: null } });
  } finally {
    await opened.close();
  }
});

it('负责人撤销使用刚保存的归属，后续改派不会被覆盖', async () => {
  const opened = await open();
  try {
    const { app } = opened;
    const admin = await loginAs(app, 'admin');
    const secondBuyer = '0199f0a0-0000-7000-8000-000000000003';
    const thirdBuyer = '0199f0a0-0000-7000-8000-000000000001';
    const lineId = await createLine({ app, cookie: admin, buyerUserId: BUYER });
    const url = `/api/v1/lines/${lineId}`;
    const assign = (buyerUserId: string, expectedOwnerAssignmentId?: string) => app.inject({
      method: 'PATCH', url, headers: { cookie: admin },
      payload: { buyerUserId, ...(expectedOwnerAssignmentId === undefined ? {} : { expectedOwnerAssignmentId }) },
    });

    const assigned = await assign(secondBuyer);
    expect(assigned.statusCode).toBe(200);
    const { ownerUndo } = OrderLineDetailSchema.parse(assigned.json());
    expect(ownerUndo?.previousBuyer?.id).toBe(BUYER);
    if (ownerUndo === undefined) throw new Error('改派没有返回撤销依据');
    const reverted = await assign(BUYER, ownerUndo.expectedAssignmentId);
    expect(reverted.statusCode).toBe(200);
    expect(reverted.json()).toMatchObject({ line: { buyer: { id: BUYER } } });

    const reassigned = OrderLineDetailSchema.parse((await assign(secondBuyer)).json()).ownerUndo;
    if (reassigned === undefined) throw new Error('再次改派没有返回撤销依据');
    expect((await assign(thirdBuyer)).statusCode).toBe(200);
    const stale = await assign(BUYER, reassigned.expectedAssignmentId);
    expect(stale.statusCode).toBe(409);
    const readback = await app.inject({ url, headers: { cookie: admin } });
    expect(readback.json()).toMatchObject({ line: { buyer: { id: thirdBuyer } } });
  } finally {
    await opened.close();
  }
});

it('导入归属不会提供近似撤销，旧无效账号保留姓名并提示待处理', async () => {
  const opened = await open();
  try {
    const { app, exec } = opened;
    const admin = await loginAs(app, 'admin');
    const buyer = await loginAs(app, 'buyer');
    const secondBuyer = '0199f0a0-0000-7000-8000-000000000003';
    const reviewer = '0199f0a0-0000-7000-8000-000000000004';
    const lineId = await createLine({ app, cookie: admin, buyerUserId: BUYER });
    const url = `/api/v1/lines/${lineId}`;
    await exec(`UPDATE owner_assignments SET source = 'po_master' WHERE subject_id = '${lineId}'`);
    const assigned = await app.inject({ method: 'PATCH', url, headers: { cookie: admin }, payload: { buyerUserId: secondBuyer } });
    expect(assigned.statusCode).toBe(200);
    expect(OrderLineDetailSchema.parse(assigned.json()).ownerUndo).toBeUndefined();
    await exec(`UPDATE users SET active = false WHERE id = '${secondBuyer}'`);
    const inactive = await app.inject({ url, headers: { cookie: buyer } });
    expect(inactive.json()).toMatchObject({ pendingBuyerName: '采购乙', line: { buyer: { id: secondBuyer } } });
    await exec(`UPDATE order_lines SET buyer_user_id = '${reviewer}' WHERE id = '${lineId}'`);
    const ineligible = await app.inject({ url, headers: { cookie: buyer } });
    expect(ineligible.json()).toMatchObject({ pendingBuyerName: '审核人甲', line: { buyer: { id: reviewer } } });
    const denied = await app.inject({ method: 'PATCH', url, headers: { cookie: buyer }, payload: { buyerUserId: BUYER } });
    expect(denied.statusCode).toBe(403);
    const recovered = await app.inject({ method: 'PATCH', url, headers: { cookie: admin }, payload: { buyerUserId: BUYER } });
    expect(recovered.statusCode).toBe(200);
    expect(OrderLineDetailSchema.parse(recovered.json()).pendingBuyerName).toBeUndefined();

  } finally {
    await opened.close();
  }
});

it('取消订单行后停止催工厂，已实发的货仍在到仓备忘录', async () => {
  const opened = await open();
  try {
    const buyer = await loginAs(opened.app, 'buyer');
    const { lineId, batchId } = await partShipped(opened.app, buyer);
    expect(reasonsOf(await today({ app: opened.app, cookie: buyer, scope: 'mine' }), batchId)).toContain('unshipped');
    const cancelled = await opened.app.inject({ method: 'POST', url: `/api/v1/lines/${lineId}/cancel`, headers: { cookie: buyer }, payload: { reason: '停止后续交运' } });
    expect(cancelled.statusCode).toBe(200);
    const result = await today({ app: opened.app, cookie: buyer, scope: 'mine' });
    expect(itemOf(result, batchId)).toMatchObject({ waitingOn: { kind: 'internal' }, reasons: ['note_missing'] });
    expect(result.arrivalMemos).toEqual([expect.objectContaining({ batchId, batchSeq: 1, inTransitQty: 1, status: 'due_today' })]);
  } finally {
    await opened.close();
  }
});

it('同一订单行同日到仓的两批货各保留自己的批次编号', async () => {
  const opened = await open();
  try {
    const buyer = await loginAs(opened.app, 'buyer');
    const { lineId, batchId: first } = await partShipped(opened.app, buyer);
    const second = await batch({ app: opened.app, cookie: buyer, input: { lineId, dates: { dateBuyerConfirmed: '2099-01-10' } } });
    const shipment = await opened.app.inject({
      method: 'POST', url: `/api/v1/batches/${second}/shipments`, headers: { cookie: buyer },
      payload: { qty: 1, shippedOn: '2099-01-09', fulfillment: { kind: 'verified', unit: '件', evidence: '合成交运单 2' } },
    });
    expect(shipment.statusCode).toBe(200);
    const result = await today({ app: opened.app, cookie: buyer, scope: 'mine' });
    expect(result.arrivalMemos).toHaveLength(2);
    expect(result.arrivalMemos).toEqual(expect.arrayContaining([
      expect.objectContaining({ batchId: first, batchSeq: 1, inTransitQty: 1 }),
      expect.objectContaining({ batchId: second, batchSeq: 2, inTransitQty: 1 }),
    ]));
  } finally {
    await opened.close();
  }
});

it('跨业务日读待办时，确认日、逾期和到仓备忘录使用同一天', async () => {
  let reads = 0;
  const opened = await open({ now: () => TODAY, today: () => localDate(++reads === 1 ? '2099-01-10' : '2099-01-11') });
  try {
    const buyer = await loginAs(opened.app, 'buyer');
    const { batchId } = await partShipped(opened.app, buyer);
    const result = await today({ app: opened.app, cookie: buyer, scope: 'mine' });
    expect(result.asOf).toBe('2099-01-10');
    expect(reasonsOf(result, batchId)).toContain('due_today');
    expect(reasonsOf(result, batchId)).not.toContain('overdue');
    expect(result.arrivalMemos).toEqual([expect.objectContaining({ batchId, status: 'due_today' })]);
  } finally {
    await opened.close();
  }
});

async function partShipped(app: HttpApp, buyer: string) {
  const lineId = await createLine({ app, cookie: buyer, buyerUserId: BUYER });
  const batchId = await batch({ app, cookie: buyer, input: { lineId, dates: { dateBuyerConfirmed: '2099-01-10' } } });
  const shipment = await app.inject({
    method: 'POST', url: `/api/v1/batches/${batchId}/shipments`, headers: { cookie: buyer },
    payload: { qty: 1, shippedOn: '2099-01-09', fulfillment: { kind: 'verified', unit: '件', evidence: '合成交运单 1' } },
  });
  expect(shipment.statusCode).toBe(200);
  return { lineId, batchId };
}

async function batch({ app, cookie, input }: { readonly app: HttpApp; readonly cookie: string; readonly input: { readonly lineId: string; readonly dates: { readonly dateBuyerConfirmed?: string; readonly dateFactoryRequired?: string } } }): Promise<string> {
  const created = await app.inject({ method: 'POST', url: `/api/v1/lines/${input.lineId}/batches`, headers: { cookie }, payload: { plannedQty: 10, receiverPartyId: RECEIVER, ...input.dates } });
  expect(created.statusCode).toBe(200);
  return idOf(created.json());
}

type TodayItem = {
  readonly reasons: string[];
  readonly refs: { readonly batchId?: string };
  readonly line: { readonly nameRaw: string | null } | null;
  readonly batch: { readonly shippedQty: number | null; readonly receivedQty: number | null; readonly lastShippedOn: string | null } | null;
};

function reasonsOf(body: { items: TodayItem[] }, batchId: string): string[] {
  return itemOf(body, batchId)?.reasons ?? [];
}

function itemOf(body: { items: TodayItem[] }, batchId: string): TodayItem | undefined {
  return body.items.find((item) => item.refs.batchId === batchId);
}

function batchIds(body: { items: { refs: { batchId?: string } }[] }): string[] {
  return body.items.flatMap((item) => item.refs.batchId === undefined ? [] : [item.refs.batchId]);
}

async function startImport(app: HttpApp, input: { readonly cookie: string; readonly fileName: string; readonly row: string }): Promise<string> {
  const detected = await upload(app, input);
  expect(detected.statusCode).toBe(200);
  const started = await app.inject({ method: 'POST', url: '/api/v1/imports', headers: { cookie: input.cookie }, payload: { fileId: detected.json().fileId, template: 'po-master-v1' } });
  expect(started.statusCode).toBe(200);
  return idOf(started.json());
}

async function commitImport(app: HttpApp, input: { readonly cookie: string; readonly fileName: string; readonly row: string }): Promise<void> {
  const id = await startImport(app, input);
  const committed = await app.inject({ method: 'POST', url: `/api/v1/imports/${id}/commit`, headers: { cookie: input.cookie } });
  expect(committed.statusCode).toBe(200);
}

async function upload(app: HttpApp, input: { readonly cookie: string; readonly fileName: string; readonly row: string }) {
  const body = Buffer.from(`${CSV_HEADER}\n${input.row}\n`);
  const boundary = '----today';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${input.fileName}"\r\nContent-Type: text/csv\r\n\r\n`),
    body,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({ method: 'POST', url: '/api/v1/imports/detect', headers: { cookie: input.cookie, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
}

function idOf(value: unknown): string {
  if (!isRecord(value) || typeof value.id !== 'string') throw new Error('没有编号');
  return value.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
