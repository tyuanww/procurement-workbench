import { expect, it } from 'vitest';
import { TodayChaseResponseSchema, TodayPageResponseSchema, TodayResponseSchema } from '@sw/contracts';
import { loginAs } from './helpers/server.js';
import { open } from './helpers/today.js';

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
    expect(first.paging).toMatchObject({ total: 501, page: 1, pageSize: 50, units: ['件', '箱'], reasonCounts: { unshipped: 501 } });
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

    const firstShipment = await ship(10000);
    expect(firstShipment.statusCode).toBe(200);
    const bulkQuery = new URLSearchParams({ reasons: 'overdue', sort: 'bulk', unit: '件' }).toString();
    const bulk = await readPage(10, `${bulkQuery}&focusId=batch%3Ahz09-batch-501`);
    expect(bulk.paging.page).toBe(1);
    expect(bulk.paging).toMatchObject({ total: 499, units: ['件', '箱'] });
    expect(bulk.items.slice(0, 2).map((item) => [item.id, item.batch?.fulfillment?.unshippedQty])).toEqual([
      ['batch:hz09-batch-501', 30000], ['batch:hz09-batch-1', 10000],
    ]);
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
