import { expect, it } from 'vitest';
import { TodayChaseResponseSchema, TodayPageResponseSchema, TodayResponseSchema } from '@sw/contracts';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import { loginAs } from './helpers/server.js';
import { open, TODAY } from './helpers/today.js';

const BUYER = '0199f0a0-0000-7000-8000-000000000002';
const OTHER_BUYER = '0199f0a0-0000-7000-8000-000000000003';
const WAREHOUSE = '0199f0a0-0000-7000-8000-000000000010';
const MIXED_REMINDER = '2099-01-10T18:30:00.000Z';

it('合并同批核收与催货后再分页，所有催单复制沿用今日完整筛选', async () => {
  const scenario = await fixture();
  try {
    const { page, chase, get } = scenario;
    const result = await page('inbox=today');
    expect(result.paging).toMatchObject({ total: 6, inboxCounts: { today: 6, scheduled: 3, unassigned: 1 }, unassignedReviewCount: 0, pendingCount: 1, chaseCounts: { all: 2, filtered: 2 } });
    expect(result.pendingBatch?.map(({ orderLineId }) => orderLineId)).toEqual(['inbox-line-12']);
    expect((await page('inbox=today&calendar=today')).pendingBatch).toEqual(result.pendingBatch);
    expect((await page('inbox=today&calendar=' + result.asOf)).pendingBatch).toEqual(result.pendingBatch);
    expect((await page('inbox=today&calendar=2099-01-11')).pendingBatch).toBeUndefined();
    expect(result.items.map(({ id }) => id).sort()).toEqual(['batch:inbox-1', 'batch:inbox-13', 'batch:inbox-14', 'batch:inbox-2', 'batch:inbox-3', 'exception:inbox-own']);
    expect(result.items).toContainEqual(expect.objectContaining({ id: 'batch:inbox-14', reasons: ['note_missing'], waitingOn: { kind: 'internal', partyId: null } }));
    const pageResults = await Promise.all([1, 2, 3].map((number) => page(`inbox=today&reasons=shipped_not_received&pageSize=1&page=${number}`)));
    const [first, second, third] = pageResults;
    expect(first?.items).toMatchObject([{ id: 'batch:inbox-1', reasons: ['overdue', 'unshipped', 'shipped_not_received'], batch: { fulfillment: { unshippedQty: 60, inTransitQty: 40 } } }]);
    expect(second?.items).toMatchObject([{ id: 'batch:inbox-2', reasons: ['shipped_not_received'], waitingOn: { kind: 'receiver' } }]);
    expect(third?.items).toMatchObject([{ id: 'batch:inbox-3', reasons: ['note_missing', 'shipped_not_received'], batch: { nextFollowUpAt: MIXED_REMINDER, fulfillment: { unshippedQty: 60 } } }]);
    expect(pageResults.map(({ arrivalMemos, paging, pendingBatch }) => [arrivalMemos.map(({ batchId }) => batchId), paging.total, paging.pendingCount, pendingBatch])).toEqual([
      [['inbox-1'], 3, 1, undefined], [['inbox-2'], 3, 1, undefined], [['inbox-3'], 3, 1, undefined],
    ]);
    expect((await chase('inbox=today')).map(({ id }) => id)).toEqual(['batch:inbox-1', 'batch:inbox-13']);
    expect((await chase('inbox=today&reasons=shipped_not_received')).map(({ id }) => id)).toEqual(['batch:inbox-1']);
    expect((await chase('inbox=today&factoryId=inbox-factory-b')).map(({ id }) => id)).toEqual(['batch:inbox-13']);
    expect((await chase('inbox=today&calendar=2099-01-10&itemId=batch:inbox-1')).map(({ id }) => id)).toEqual(['batch:inbox-1']);
    expect(await chase('inbox=today&itemId=batch:inbox-3')).toEqual([]);
    expect(await chase('inbox=scheduled')).toEqual([]);
    expect((await chase('')).map(({ id }) => id)).toContain('batch:inbox-3');
    expect((await page('inbox=today&work=all_unshipped')).items.map(({ id }) => id)).toContain('batch:inbox-5');
    expect((await page('inbox=today&focusId=batch:inbox-5')).paging).toMatchObject({ focusInbox: 'today', focusDay: '2099-01-10', focusWork: 'all_unshipped' });
    const arrivals = TodayResponseSchema.parse(await get('/api/v1/today?scope=mine')).arrivalMemos;
    expect(arrivals).toContainEqual(expect.objectContaining({ batchId: 'inbox-8', status: 'in_transit', confirmedDate: null }));
    expect(arrivals).toContainEqual(expect.objectContaining({ batchId: 'inbox-9', status: 'in_transit' }));
  } finally {
    await scenario.close();
  }
});

it('本人已约按下次时间和业务日排列，未分派和审核另有入口', async () => {
  const scenario = await fixture();
  try {
    const { page, app, clock, chase, buyer } = scenario;
    const scheduled = await page('inbox=scheduled&scope=all');
    expect(scheduled.items.map(({ id }) => id)).toEqual(['batch:inbox-4', 'batch:inbox-3', 'batch:inbox-14']);
    expect(scheduled.arrivalMemos).toEqual([]);
    expect(scheduled.pendingBatch).toBeUndefined();
    const calendar = await page('inbox=scheduled&calendar=2099-01-11&pageSize=1&focusId=batch:inbox-3');
    expect(calendar.paging).toMatchObject({
      page: 2, total: 2, pendingCount: 1, focusInbox: 'scheduled', focusDay: '2099-01-11',
      calendar: { date: '2099-01-11', days: [{ date: '2099-01-11', count: 2 }, { date: '2099-01-12', count: 1 }] },
    });
    expect(calendar.items.map(({ id }) => id)).toEqual(['batch:inbox-3']);
    const preview = await page('inbox=today&scope=all&calendar=today&calendarFollowUps=true');
    expect(preview.paging.calendar).toEqual({
      date: '2099-01-10', days: [{ date: '2099-01-10', count: preview.paging.total }],
      scheduledDays: [{ date: '2099-01-11', count: 2 }, { date: '2099-01-12', count: 1 }],
    });
    expect(preview.items.map(({ id }) => id)).toContain('batch:inbox-3');
    expect((await page('inbox=today&calendar=today')).paging.calendar?.scheduledDays).toBeUndefined();
    const focused = await page('inbox=today&focusId=batch:inbox-4');
    expect(focused.paging).toMatchObject({ focusInbox: 'scheduled', focusDay: '2099-01-11' });
    const foreign = await page('inbox=today&scope=all&focusId=batch:inbox-6');
    expect(foreign.paging.focusInbox).toBeUndefined();
    expect(foreign.items.map(({ id }) => id)).not.toContain('exception:inbox-foreign');
    expect(foreign.arrivalMemos.map(({ batchId }) => batchId)).not.toContain('inbox-6');

    const unassigned = await page('inbox=unassigned');
    expect(unassigned.items.map(({ id }) => id)).toEqual(['batch:inbox-7']);
    expect(unassigned.arrivalMemos.map(({ batchId }) => batchId)).toEqual(['inbox-7']);
    const reviewer = await loginAs(app, 'reviewer');
    const shared = await page('inbox=unassigned&scope=all&focusId=review', reviewer);
    expect(shared.items.map(({ id }) => id)).toEqual(['batch:inbox-7', 'review']);
    expect(shared.paging).toMatchObject({ inboxCounts: { today: 0, scheduled: 0, unassigned: 2 }, unassignedReviewCount: 1, pendingCount: 0, focusInbox: 'unassigned' });

    clock.set(MIXED_REMINDER);
    expect((await page('inbox=scheduled')).items.map(({ id }) => id)).toEqual(['batch:inbox-14']);
    expect((await page('inbox=today&reasons=follow_up_due')).items.map(({ id }) => id)).toEqual(['batch:inbox-3', 'batch:inbox-4']);
    expect((await chase('inbox=today&itemId=batch:inbox-3')).map(({ id }) => id)).toEqual(['batch:inbox-3']);
    expect((await page('inbox=today&focusId=batch:inbox-10')).paging.focusInbox).toBeUndefined();
    expect((await page('inbox=today&focusId=batch:inbox-11')).paging.focusInbox).toBeUndefined();
    const cleared = await app.inject({ method: 'POST', url: '/api/v1/follow-ups', headers: { cookie: buyer }, payload: {
      batchId: 'inbox-14', orderLineId: 'inbox-line-14', kind: 'message', text: '撤销合成跟进提醒', nextFollowUpAt: null,
    } });
    expect(cleared.statusCode, cleared.body).toBe(200);
    expect((await page('inbox=today&work=internal_note')).items).toContainEqual(expect.objectContaining({ id: 'batch:inbox-14', reasons: ['note_missing'] }));
    expect(await chase('inbox=today&itemId=batch:inbox-14')).toEqual([]);
  } finally {
    await scenario.close();
  }
});

async function fixture() {
  const clock = new FixedClock(TODAY);
  const opened = await open(clock);
  try {
    await opened.exec(inboxFixture);
    const buyer = await loginAs(opened.app, 'buyer');
    const get = async (url: string, cookie = buyer) => {
      const response = await opened.app.inject({ url, headers: { cookie } });
      expect(response.statusCode, response.body).toBe(200);
      return response.json();
    };
    const page = async (query: string, cookie = buyer) => {
      const params = new URLSearchParams({ scope: 'mine', includePending: 'true' });
      for (const [key, value] of new URLSearchParams(query)) params.set(key, value);
      return TodayPageResponseSchema.parse(await get(`/api/v1/today?${params}`, cookie));
    };
    const chase = async (query: string) => TodayChaseResponseSchema.parse(await get(`/api/v1/today/chase?${query}`));
    return { ...opened, buyer, clock, get, page, chase };
  } catch (error) {
    await opened.close();
    throw error;
  }
}

const inboxFixture = `
  INSERT INTO parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse)
  VALUES ('inbox-factory-a', now(), now(), '合成甲厂', true, true, false),
         ('inbox-factory-b', now(), now(), '合成乙厂', true, true, false);
  INSERT INTO purchase_orders (id, created_at, updated_at, po_raw, po_format, related_po_raws, lane, supplier_party_id)
  SELECT 'inbox-po-' || n, now(), now(), 'INBOX-' || n, 'OTHER', array[]::text[], 'finished',
         CASE n WHEN 13 THEN 'inbox-factory-b' ELSE 'inbox-factory-a' END
  FROM generate_series(1, 14) AS n;
  INSERT INTO order_lines (id, created_at, updated_at, purchase_order_id, lane, name_raw, qty_ordered, unit,
    buyer_user_id, receiver_party_id, origin, missing_in_latest_import, latest_import_presence, stage, stage_changed_at)
  SELECT 'inbox-line-' || n, now(), now(), 'inbox-po-' || n, 'finished', '合成工作台 ' || n, 100, '件',
         CASE n WHEN 6 THEN '${OTHER_BUYER}' WHEN 7 THEN NULL ELSE '${BUYER}' END,
         '${WAREHOUSE}', 'manual', false, 'not_applicable', 'awaiting_shipment', now()
  FROM generate_series(1, 14) AS n;
  INSERT INTO delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, planned_unit, receiver_party_id,
    date_buyer_confirmed, first_confirmed_date, status, status_changed_at, closed_at, cancelled_at, origin)
  SELECT 'inbox-' || n, now(), now(), 'inbox-line-' || n, 1, 100, '件', '${WAREHOUSE}', due, due,
         state, now(), CASE WHEN state = 'closed' THEN now() END, CASE WHEN state = 'cancelled' THEN now() END, 'manual'
  FROM (VALUES (1, DATE '2099-01-01', 'shipped'), (2, DATE '2099-01-10', 'shipped'), (3, DATE '2099-01-10', 'shipped'),
    (4, DATE '2099-03-01', 'confirmed'), (5, DATE '2099-03-01', 'confirmed'), (6, DATE '2099-01-10', 'shipped'),
    (7, DATE '2099-01-10', 'shipped'), (8, NULL, 'shipped'), (9, DATE '2099-03-01', 'shipped'),
    (10, DATE '2099-01-01', 'closed'), (11, DATE '2099-01-01', 'cancelled'), (13, NULL, 'awaiting_date'), (14, DATE '2099-03-01', 'shipped')) AS sample(n, due, state);
  INSERT INTO shipments (id, created_at, updated_at, batch_id, qty, shipped_on, fulfillment, source, created_by)
  SELECT 'ship-inbox-' || n, now(), now(), 'inbox-' || n, qty, DATE '2099-01-09',
         '{"kind":"verified","unit":"件","evidence":"合成发货凭据","reviewReason":null}'::jsonb, 'manual', '${BUYER}'
  FROM (VALUES (1, 40), (2, 100), (3, 40), (6, 40), (7, 100), (8, 100), (9, 100), (10, 40), (11, 40), (14, 40)) AS shipments(n, qty);
  INSERT INTO delivery_notes (id, created_at, updated_at, batch_id, status, returned_on, created_by)
  SELECT 'note-inbox-' || n, now(), now(), 'inbox-' || n, 'returned', DATE '2099-01-09', '${BUYER}'
  FROM unnest(ARRAY[1, 2, 6, 7, 8, 9]) AS n;
  INSERT INTO follow_ups (id, created_at, updated_at, order_line_id, batch_id, kind, text, reminder, created_by)
  SELECT 'follow-inbox-' || n, now(), now(), 'inbox-line-' || n, 'inbox-' || n, 'message', '合成提醒',
         jsonb_build_object('nextAt', reminder), '${BUYER}'
  FROM (VALUES (3, '${MIXED_REMINDER}'), (4, '2099-01-10T16:30:00.000Z'), (6, '2099-01-10T19:00:00.000Z'),
               (10, '2099-01-11T05:00:00.000Z'), (14, '2099-01-12T05:00:00.000Z')) AS follows(n, reminder);
  INSERT INTO exceptions (id, created_at, updated_at, order_line_id, batch_id, type, note, status, opened_by)
  VALUES ('inbox-own', now(), now(), 'inbox-line-1', 'inbox-1', 'quality', '合成异常', 'open', '${BUYER}'),
         ('inbox-foreign', now(), now(), 'inbox-line-6', 'inbox-6', 'quality', '合成其他人异常', 'open', '${BUYER}');
  INSERT INTO party_aliases (id, created_at, updated_at, raw_name, norm_name, status, seen_count)
  VALUES ('inbox-review', now(), now(), '合成别名', '合成别名', 'pending', 1);
`;
