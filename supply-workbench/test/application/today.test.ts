import { expect, it } from 'vitest';
import {batchFulfillment, localDate, entityId} from '../../packages/domain/src/index.js';
import { makeGetToday } from '../../packages/application/src/today/index.js';
import type { TodayReadModel } from '../../packages/application/src/ports/today-read-model.js';
import type { TodayCatalog, TodoBatchSource, TodoBatchView, TodoLineView } from '../../packages/application/src/today/views.js';
import { aUser, createMemory, FixedClock } from '../../packages/testkit/src/index.js';

const today = localDate('2026-10-12');
const timeZone = 'Asia/Shanghai';

function source(patch: Partial<TodoBatchSource> = {}): TodoBatchSource {
  return {
    id: 'b1',
    orderLineId: 'line-1',
    isLineCancelled: false,
    ownerUserId: 'buyer-1',
    status: 'confirmed',
    plannedQty: 10,
    dateBuyerConfirmed: localDate('2026-10-10'),
    dateFactoryRequired: null,
    dateSupplierPromised: null,
    receiverPartyId: 'warehouse',
    supplierPartyId: 'supplier',
    overdueDays: 2,
    noteStatus: 'returned',
    shipments: [],
    receipts: [],
    earliestHintDate: null,
    fulfillment: batchFulfillment({ batch: { plannedQty: 10, plannedUnit: '件' }, shipments: [], receipts: [] }),
    ...patch,
  };
}

function catalog(patch: Partial<TodayCatalog> = {}): TodayCatalog {
  return {
    sources: [source(), source({ id: 'free', orderLineId: 'line-2', ownerUserId: null })],
    lines: [],
    batches: [],
    parties: [],
    ...patch,
  };
}

function lineView(patch: Partial<TodoLineView> = {}): TodoLineView {
  return {
    id: 'line-1',
    lane: 'finished',
    poRaw: 'PO-9',
    poFormat: 'OTHER',
    nameRaw: '面膜',
    itemCodeRaw: null,
    barcodeRaw: null,
    buyerName: null,
    ...patch,
  };
}

function batchView(patch: Partial<TodoBatchView> = {}): TodoBatchView {
  return {
    id: 'b1',
    seq: 1,
    plannedQty: 10,
    status: 'confirmed',
    noteStatus: 'returned',
    dateBuyerConfirmed: localDate('2026-10-10'),
    firstConfirmedDate: localDate('2026-10-10'),
    dateFactoryRequired: null,
    dateSupplierPromised: null,
    shippedQty: 4,
    receivedQty: 0,
    lastShippedOn: localDate('2026-10-09'),
    ...patch,
  };
}

function readModel(patch: Partial<TodayReadModel> = {}): TodayReadModel {
  return {
    loadCatalog: async () => catalog(),
    loadPendingBatch: async () => [],
    loadOpenExceptions: async () => [],
    loadReviewCounts: async () => ({ aliases: 1, codes: 0, links: 0, multiName: 0 }),
    loadUncommittedImports: async () => [],
    ...patch,
  };
}

it('scope=mine 包含未分配', async () => {
  const memory = createMemory();
  const getToday = makeGetToday({ timeZone, today: readModel(), settings: memory.stores.settings, clock: new FixedClock('2026-10-12T00:00:00.000Z') });
  const mine = await getToday({ scope: 'mine' }, aUser({ id: entityId('buyer-1'), roles: ['buyer'] }));
  expect(mine.items.map((item) => item.id).sort()).toEqual(['batch:b1', 'batch:free']);
  expect(mine.asOf).toBe(today);
});

it('个人工作台在分页前只数本人逾期未发，提醒跨业务日且到点回到待跟进', async () => {
  const memory = createMemory();
  const clock = new FixedClock('2026-10-12T00:00:00.000Z', timeZone);
  const nextFollowUpAt = '2026-10-12T16:00:00.000Z';
  const facts = source().fulfillment;
  const sources = [source(), source({ id: 'later', nextFollowUpAt }), source({ id: 'second' }),
    source({ id: 'free', ownerUserId: null }), source({ id: 'other', ownerUserId: 'buyer-2' }),
    source({ id: 'today', dateBuyerConfirmed: today, overdueDays: 0 }), source({ id: 'closed', status: 'closed' }),
    source({ id: 'unknown', fulfillment: { ...facts, unshippedQty: null } }), source({ id: 'fulfilled', fulfillment: { ...facts, unshippedQty: 0 } })];
  const getToday = makeGetToday({ timeZone, clock, settings: memory.stores.settings,
    today: readModel({ loadCatalog: async () => catalog({ sources, lines: [lineView()], batches: [batchView(), batchView({ id: 'later' })] }) }) });
  const buyer = aUser({ id: entityId('buyer-1'), roles: ['buyer'] });
  const first = await getToday.personal({ scope: 'pending', page: 1, pageSize: 1 }, buyer);
  expect(first).toMatchObject({ counts: { pending: 2, scheduled: 1 }, total: 2, page: 1, asOf: today });
  expect(first.items.map((item) => item.id)).toEqual(['batch:b1']);
  const next = await getToday.personal({ scope: 'pending', page: 1, pageSize: 1, focusId: 'batch:second' }, buyer);
  expect(next.page).toBe(2);
  expect(next.items.map((item) => item.id)).toEqual(['batch:second']);
  const calendar = await getToday.personal({ scope: 'scheduled', page: 1, pageSize: 1, calendar: localDate('2026-10-13') }, buyer);
  expect(calendar).toMatchObject({ counts: first.counts, total: 1, calendar: { days: [{ date: '2026-10-13', count: 1 }] } });
  expect(calendar.items).toMatchObject([{ id: 'batch:later', batch: { nextFollowUpAt } }]);
  clock.set(nextFollowUpAt);
  const due = await getToday.personal({ scope: 'pending', page: 1, pageSize: 1, calendar: 'today', focusId: 'batch:later' }, buyer);
  expect(due).toMatchObject({ counts: { pending: 3, scheduled: 0 }, total: 3, calendar: { date: '2026-10-13', days: [{ date: '2026-10-13', count: 3 }] } });
  expect(due.items).toMatchObject([{ id: 'batch:later', batch: { nextFollowUpAt }, reasons: ['overdue', 'follow_up_due', 'unshipped'] }]);
});

it('review_pending 只给审核人', async () => {
  const memory = createMemory();
  const getToday = makeGetToday({ timeZone, today: readModel({ loadCatalog: async () => catalog({ sources: [] }) }), settings: memory.stores.settings, clock: new FixedClock('2026-10-12T00:00:00.000Z') });
  const reviewer = await getToday({ scope: 'all' }, aUser({ roles: ['reviewer'] }));
  const buyer = await getToday({ scope: 'all' }, aUser({ roles: ['buyer'] }));
  expect(reviewer.items.map((item) => item.id)).toEqual(['review']);
  expect(reviewer.items[0]).toMatchObject({ line: null, batch: null });
  expect(buyer.items).toEqual([]);
});

it('UTC 前一天 16:30 时，asOf 已经是上海的今天', async () => {
  const memory = createMemory();
  const clock = new FixedClock('2026-10-11T16:30:00.000Z', 'Asia/Shanghai');
  const getToday = makeGetToday({ timeZone, today: readModel({ loadCatalog: async () => catalog({ sources: [] }), loadReviewCounts: async () => ({ aliases: 0, codes: 0, links: 0, multiName: 0 }) }), settings: memory.stores.settings, clock });
  const result = await getToday({ scope: 'all' }, aUser({ roles: ['buyer'] }));
  expect(clock.now().slice(0, 10)).toBe('2026-10-11');
  expect(result.asOf).toBe('2026-10-12');
});

it('目录里有订单行时，待办带出品名和表单要用的批次', async () => {
  const memory = createMemory();
  const getToday = makeGetToday({
    timeZone,
    today: readModel({
      loadCatalog: async () => catalog({
        sources: [source()],
        lines: [lineView({ nameRaw: '面膜' })],
        batches: [batchView()],
      }),
    }),
    settings: memory.stores.settings,
    clock: new FixedClock('2026-10-12T00:00:00.000Z'),
  });
  const result = await getToday({ scope: 'mine' }, aUser({ id: entityId('buyer-1'), roles: ['buyer'] }));
  const item = result.items.find((row) => row.refs.batchId === 'b1');
  expect(item?.line?.nameRaw).toBe('面膜');
  expect(item?.line?.id).toBe('line-1');
  expect(item?.line?.lane).toBe('finished');
  expect(item?.batch).toMatchObject({
    id: 'b1',
    plannedQty: 10,
    shippedQty: 4,
    receivedQty: 0,
    dateBuyerConfirmed: localDate('2026-10-10'),
    lastShippedOn: localDate('2026-10-09'),
  });
});

it('订单行不在目录里时，getToday 仍返回，line 是 null', async () => {
  const memory = createMemory();
  const getToday = makeGetToday({
    timeZone,
    today: readModel({
      loadCatalog: async () => catalog({
        sources: [source({ orderLineId: 'missing-line' })],
        lines: [],
        batches: [batchView()],
      }),
    }),
    settings: memory.stores.settings,
    clock: new FixedClock('2026-10-12T00:00:00.000Z'),
  });
  const result = await getToday({ scope: 'mine' }, aUser({ id: entityId('buyer-1'), roles: ['buyer'] }));
  expect(result.items).toHaveLength(1);
  expect(result.items[0]?.line).toBeNull();
  expect(result.items[0]?.batch?.id).toBe('b1');
});

it('异常可以指向未列入来源、但仍在批次目录里的批次', async () => {
  const memory = createMemory();
  const getToday = makeGetToday({
    timeZone,
    today: readModel({
      loadCatalog: async () => catalog({
        sources: [],
        lines: [lineView({ nameRaw: '面膜' })],
        batches: [batchView({ id: 'closed-1', status: 'closed' })],
      }),
      loadOpenExceptions: async () => [{ id: 'ex-1', orderLineId: 'line-1', batchId: 'closed-1', type: 'delay', note: '晚了', openedBy: 'buyer-1' }],
    }),
    settings: memory.stores.settings,
    clock: new FixedClock('2026-10-12T00:00:00.000Z'),
  });
  const result = await getToday({ scope: 'mine' }, aUser({ id: entityId('buyer-1'), roles: ['buyer'] }));
  const item = result.items.find((row) => row.subject === 'exception');
  expect(item?.line?.nameRaw).toBe('面膜');
  expect(item?.batch).toMatchObject({ id: 'closed-1', status: 'closed' });
});
