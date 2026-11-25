import { expect, it } from 'vitest';
import { FollowUpViewSchema, LineTimelineSchema, TodayChaseResponseSchema, TodayPageResponseSchema, TodayResponseSchema } from '@sw/contracts';
import { loginAs } from './helpers/server.js';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import { open, TODAY } from './helpers/today.js';

it('行动板按原因分出完整的 50 行各页，催单使用同一筛选及实际归属', async () => {
  const { app, exec, close } = await open();
  try {
    await exec(chaseFixture);
    const cookie = await loginAs(app, 'buyer');
    const get = async (url: string) => {
      const response = await app.inject({ url, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      return response.json();
    };
    const readPage = async (page: number, filters = 'reasons=unshipped') =>
      TodayPageResponseSchema.parse(await get(`/api/v1/today?scope=mine&includePending=true&pageSize=50&page=${page}&${filters}`));
    const chase = async (filters: string) =>
      TodayChaseResponseSchema.parse(await get(`/api/v1/today/chase?${filters}`));

    const legacy = TodayResponseSchema.parse(await get('/api/v1/today?scope=mine'));
    expect(legacy.items).toHaveLength(500);
    expect(legacy.truncated).toBe(true);

    const first = await readPage(1);
    const all = [...first.items];
    expect(first.paging).toMatchObject({ total: 501, page: 1, pageSize: 50, units: ['件', '箱'], reasonCounts: { unshipped: 501 }, chaseCounts: { all: 501, filtered: 501 } });
    expect(first.paging.chaseItemIds).toEqual(first.items.map((item) => item.id));
    expect(first.items[0]?.id).toBe('batch:hz09-batch-1');
    expect(first.paging.factories.map((factory) => factory.id).sort()).toEqual(['hz09-factory-a', 'hz09-factory-b']);
    expect(first.pendingBatch?.map((row) => row.orderLineId)).toContain('hz09-line-503');
    for (let page = 2; page <= 11; page += 1) {
      const result = await readPage(page);
      expect(result.paging).toMatchObject({ total: 501, page });
      expect(result.items).toHaveLength(page === 11 ? 1 : 50);
      expect(result.truncated).toBe(false);
      all.push(...result.items);
    }
    expect(new Set(all.map((item) => item.id)).size).toBe(501);
    const lastId = all.at(-1)?.id;
    if (lastId === undefined) throw new Error('没有最后一行');
    const focus = encodeURIComponent(lastId);
    const located = await readPage(1, `reasons=unshipped&focusId=${focus}`);
    expect(located.paging.page).toBe(11);
    expect(located.items[0]?.id).toBe(lastId);
    const foreign = await readPage(1, 'reasons=unshipped&focusId=batch%3Ahz09-batch-502');
    expect(foreign.paging.page).toBe(1);
    expect(foreign.items.some((item) => item.id === 'batch:hz09-batch-502')).toBe(false);
    const filtered = await readPage(1, `reasons=overdue&focusId=${focus}`);
    expect(filtered.paging.page).toBe(1);


    const allChase = await chase('reasons=unshipped');
    expect(allChase.map((item) => item.id).sort()).toEqual(all.map((item) => item.id).sort());
    const a = await chase('reasons=unshipped&factoryId=hz09-factory-a');
    expect(a).toHaveLength(500);
    expect(a.every((item) => item.factory.id === 'hz09-factory-a')).toBe(true);
    expect(a.some((item) => item.id === 'batch:hz09-batch-501')).toBe(true);
    const b = await chase('reasons=unshipped&factoryId=hz09-factory-b');
    expect(b.map((item) => item.id)).toEqual(['batch:hz09-batch-250']);
    const exactBatch = 'itemId=batch%3Ahz09-batch-501';
    expect(await chase('itemId=batch%3Ahz09-batch-502&scope=all')).toEqual([]);
    expect(await chase('itemId=batch%3Ahz09-batch-50x')).toEqual([]);
    expect(await chase('itemId=batch%3Ahz09-batch-504')).toEqual([]);

    const firstShipment = await ship(10000);
    expect(firstShipment.statusCode).toBe(200);
    const bulkQuery = new URLSearchParams({ reasons: 'overdue', sort: 'bulk', unit: '件' }).toString();
    const bulk = await readPage(10, `${bulkQuery}&focusId=batch%3Ahz09-batch-501`);
    expect(bulk.paging.page).toBe(1);
    expect(bulk.paging).toMatchObject({ total: 499, units: ['件', '箱'], chaseCounts: { all: 501, filtered: 499 } });
    expect(bulk.items.slice(0, 2).map((item) => [item.id, item.batch?.fulfillment?.unshippedQty])).toEqual([
      ['batch:hz09-batch-501', 30000], ['batch:hz09-batch-1', 10000],
    ]);
    expect(bulk.paging.chaseItemIds?.slice(0, 2)).toEqual(['batch:hz09-batch-501', 'batch:hz09-batch-1']);
    expect(await chase(exactBatch)).toMatchObject([{ id: 'batch:hz09-batch-501', unshippedQty: 30_000, unit: '件' }]);
    expect(await chase('')).toHaveLength(501);
    const bulkCopy = await chase(bulkQuery);
    expect(bulkCopy.map((item) => item.id).slice(0, 2)).toEqual(['batch:hz09-batch-501', 'batch:hz09-batch-1']);
    expect(bulkCopy).toHaveLength(499);
    expect((await readPage(1, 'reasons=fulfillment_review')).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'batch:hz09-batch-504', reasons: ['fulfillment_review'] }),
    ]));
    expect(bulkCopy.every((item) => item.unit === '件' && item.reasons.includes('overdue'))).toBe(true);

    const lastShipment = await ship(30000);
    expect(lastShipment.statusCode).toBe(200);
    const clamped = await readPage(11);
    expect(clamped.paging).toMatchObject({ page: 10, total: 500 });
    expect(clamped.items).toHaveLength(50);
    expect(clamped.arrivalMemos).toContainEqual(expect.objectContaining({ batchId: 'hz09-batch-501', inTransitQty: 40000 }));
    expect((await chase('reasons=unshipped')).some((item) => item.id === 'batch:hz09-batch-501')).toBe(false);
    expect(await chase(exactBatch)).toEqual([]);

    const [factoryWork, internalWork, unfiltered, nonChase] = await Promise.all([
      readPage(10, 'work=factory_chase'), readPage(1, 'work=internal_note'), readPage(1, ''),
      readPage(1, 'reasons=fulfillment_review'),
    ]);
    expect(factoryWork.paging).toMatchObject({ total: 500, page: 10, chaseCounts: { all: 500, filtered: 500 }, internalNoteCount: 1 });
    expect(factoryWork.items.map((item) => item.id)).toEqual(factoryWork.paging.chaseItemIds);
    expect(internalWork.paging).toMatchObject({ total: 1, chaseCounts: { all: 500, filtered: 0 }, internalNoteCount: 1 });
    expect(internalWork.items).toMatchObject([{ id: 'batch:hz09-batch-501', waitingOn: { kind: 'internal' }, reasons: ['note_missing'] }]);
    expect(internalWork.arrivalMemos).toContainEqual(expect.objectContaining({ batchId: 'hz09-batch-501', inTransitQty: 40000 }));
    expect(unfiltered.paging.total).toBe(502);
    expect(nonChase.items.map((item) => item.id)).toEqual(['batch:hz09-batch-504']);
    expect(await chase('work=internal_note')).toEqual([]);

    function ship(qty: number) {
      return app.inject({
        method: 'POST', url: '/api/v1/batches/hz09-batch-501/shipments', headers: { cookie },
        payload: { qty, shippedOn: '2099-01-09', fulfillment: { kind: 'verified', unit: '件', evidence: 'HZ-09 合成交运单' } },
      });
    }
  } finally {
    await close();
  }
});

it('只在本采购批次保留最新的明确跟进时间，到点出现，清空可撤销', async () => {
  const clock = new FixedClock(TODAY);
  const { app, exec, close } = await open(clock);
  try {
    await exec(chaseFixture);
    const cookie = await loginAs(app, 'buyer');
    const other = await loginAs(app, 'admin');
    const reminder = '2099-01-11T02:00:00.000Z';
    const target = { batchId: 'hz09-batch-501', orderLineId: 'hz09-line-501', kind: 'message' };
    const post = (fields: Record<string, unknown>) => app.inject({
      method: 'POST', url: '/api/v1/follow-ups', headers: { cookie }, payload: { ...target, ...fields },
    });
    const reminders = async (reason: string, { requester = cookie, scope = 'mine' } = {}) => {
      const response = await app.inject({ url: `/api/v1/today?scope=${scope}&page=1&reasons=${reason}`, headers: { cookie: requester } });
      expect(response.statusCode).toBe(200);
      return TodayPageResponseSchema.parse(response.json());
    };

    const legacy = await post({ text: '工厂回复，先发一半' });
    expect(legacy.statusCode).toBe(200);
    expect(FollowUpViewSchema.parse(legacy.json())).not.toHaveProperty('nextFollowUpAt');

    const saved = await post({ text: '明早十点联系供应商', nextFollowUpAt: reminder });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(FollowUpViewSchema.parse(saved.json())).toMatchObject({ nextFollowUpAt: reminder });
    expect((await reminders('follow_up_due')).items).toEqual([]);
    const malformed = await post({ text: '错误本地时间', nextFollowUpAt: '2099-01-11T10:00' });
    expect(malformed.statusCode).toBe(400);
    const otherBatch = await post({ text: '另一位采购的批次', nextFollowUpAt: reminder, orderLineId: 'hz09-line-502', batchId: 'hz09-batch-502' });
    expect(otherBatch.statusCode).toBe(400);

    expect((await post({ text: '订单行没有批次', batchId: undefined, nextFollowUpAt: reminder })).statusCode).toBe(400);
    expect((await post({ text: '补充说明' })).statusCode).toBe(200);
    const awaiting = await reminders('follow_up_scheduled');
    expect(awaiting.paging.reasonCounts).toMatchObject({ follow_up_due: 0, follow_up_scheduled: 1 });
    expect(awaiting.items).toMatchObject([{ id: 'batch:hz09-batch-501', batch: { nextFollowUpAt: reminder } }]);
    expect((await reminders('follow_up_scheduled', { requester: other })).items).toEqual([]);
    expect((await reminders('follow_up_scheduled', { requester: other, scope: 'all' })).items).toHaveLength(1);

    const changedAt = '2099-01-11T03:00:00.000Z';
    const changed = await post({ text: '改到明早十一点', nextFollowUpAt: changedAt });
    expect(changed.statusCode).toBe(200);
    clock.set(reminder);
    expect((await reminders('follow_up_due')).items).toEqual([]);
    expect((await reminders('follow_up_scheduled')).items).toMatchObject([{ batch: { nextFollowUpAt: changedAt } }]);

    const timeline = await app.inject({ url: '/api/v1/lines/hz09-line-501/timeline', headers: { cookie } });
    expect(timeline.statusCode).toBe(200);
    expect(LineTimelineSchema.parse(timeline.json()).events).toContainEqual(expect.objectContaining({
      kind: 'follow_up', text: '改到明早十一点', nextFollowUpAt: changedAt,
    }));

    const shipped = await app.inject({
      method: 'POST', url: '/api/v1/batches/hz09-batch-501/shipments', headers: { cookie },
      payload: { qty: 40000, shippedOn: '2099-01-10', fulfillment: { kind: 'verified', unit: '件', evidence: '合成交运单' } },
    });
    expect(shipped.statusCode).toBe(200);
    clock.set(changedAt);
    const due = await reminders('follow_up_due');
    expect(due.items).toMatchObject([{ id: 'batch:hz09-batch-501', waitingOn: { kind: 'internal' }, batch: { status: 'shipped', nextFollowUpAt: changedAt } }]);
    expect(due.items[0]?.reasons).not.toContain('unshipped');
    expect(due.arrivalMemos).toContainEqual(expect.objectContaining({ batchId: 'hz09-batch-501', inTransitQty: 40000 }));
    expect(due.paging.chaseCounts).toEqual({ all: 500, filtered: 0 });

    const cleared = await post({ text: '已完成本次跟进', nextFollowUpAt: null });
    expect(cleared.statusCode).toBe(200);
    const record = FollowUpViewSchema.parse(cleared.json());
    expect(record.nextFollowUpAt).toBeNull();
    expect((await reminders('follow_up_due')).items).toEqual([]);
    const undo = await app.inject({ method: 'DELETE', url: `/api/v1/follow-ups/${record.id}`, headers: { cookie } });
    expect(undo.statusCode).toBe(204);
    expect((await reminders('follow_up_due')).items).toMatchObject([{ batch: { nextFollowUpAt: changedAt } }]);
    const undoChange = await app.inject({ method: 'DELETE', url: '/api/v1/follow-ups/' + FollowUpViewSchema.parse(changed.json()).id, headers: { cookie } });
    expect(undoChange.statusCode).toBe(204);
    expect((await reminders('follow_up_due')).items).toMatchObject([{ batch: { nextFollowUpAt: reminder } }]);

    await exec("UPDATE delivery_batches SET status = 'closed', closed_at = now() WHERE id = 'hz09-batch-501'");
    expect((await reminders('follow_up_due')).items).toEqual([]);
    expect((await post({ text: '已关闭批次', nextFollowUpAt: reminder })).statusCode).toBe(400);
  } finally {
    await close();
  }
});

const chaseFixture = `
  INSERT INTO parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse)
  VALUES ('hz09-factory-a', now(), now(), '合成催货甲厂', true, true, false),
         ('hz09-factory-b', now(), now(), '合成催货乙厂', true, true, false);
  INSERT INTO purchase_orders (id, created_at, updated_at, po_raw, po_format, related_po_raws, lane, supplier_party_id)
  SELECT 'hz09-po-' || n, now(), now(), 'HZ09-' || n, 'OTHER', array[]::text[], 'finished',
         CASE n WHEN 250 THEN 'hz09-factory-b' ELSE 'hz09-factory-a' END
  FROM generate_series(1, 504) AS n;
  INSERT INTO order_lines (id, created_at, updated_at, purchase_order_id, lane, name_raw, qty_ordered, unit,
    buyer_user_id, receiver_party_id, origin, missing_in_latest_import, latest_import_presence, stage, stage_changed_at)
  SELECT 'hz09-line-' || n, now(), now(), 'hz09-po-' || n, 'finished', '合成待催 ' || n,
         CASE n WHEN 1 THEN 10000 WHEN 2 THEN 90000 WHEN 501 THEN 40000 ELSE 100 END,
         CASE n WHEN 2 THEN '箱' WHEN 504 THEN NULL ELSE '件' END,
         CASE n WHEN 502 THEN '0199f0a0-0000-7000-8000-000000000003' ELSE '0199f0a0-0000-7000-8000-000000000002' END,
         '0199f0a0-0000-7000-8000-000000000010', 'manual', false, 'not_applicable', 'awaiting_shipment', now()
  FROM generate_series(1, 504) AS n;
  INSERT INTO delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, planned_unit, receiver_party_id,
    date_buyer_confirmed, first_confirmed_date, status, status_changed_at, origin)
  SELECT 'hz09-batch-' || n, now(), now(), line.id, 1, line.qty_ordered, line.unit, line.receiver_party_id,
         dates.confirmed, dates.confirmed, CASE n WHEN 500 THEN 'awaiting_date' ELSE 'confirmed' END, now(), 'manual'
  FROM generate_series(1, 504) AS n
  JOIN order_lines line ON line.id = 'hz09-line-' || n
  CROSS JOIN LATERAL (SELECT CASE n WHEN 500 THEN NULL WHEN 501 THEN DATE '2099-01-02' ELSE DATE '2099-01-01' END AS confirmed) dates
  WHERE n <> 503;
`;
