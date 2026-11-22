import { expect, it } from 'vitest';
import {KPI_COPY, localDate, averageDelay, buyerLoads, currentlyOverdue, dateChangeCount, dueBatches, noteReturnDays, onTimeRate, openExceptionCount, unassignedOpenExceptionCount, stuckDistribution, weeklyOnTime, type KpiBatch, type KpiInput, type LineStage, type OrderLineLoad, entityId} from '../../packages/domain/src/index.js';

const from = localDate('2026-10-01');
const to = localDate('2026-10-31');
const today = localDate('2026-10-12');

function batch(patch: Partial<KpiBatch> & Pick<KpiBatch, 'id' | 'status'>): KpiBatch {
  return {
    lane: 'finished',
    firstConfirmedDate: null,
    dateBuyerConfirmed: null,
    statusChangedAt: '2026-10-12T00:00:00.000Z',
    cancelledAt: null,
    closedAt: null,
    buyerUserId: entityId('buyer-1'),
    supplierPartyId: entityId('supplier'),
    receiverPartyId: entityId('warehouse'),
    receipts: [],
    shipments: [],
    noteReturnedOn: null,
    ...patch,
  };
}

const day = localDate;

function input(batches: readonly KpiBatch[], extra: Partial<KpiInput> = {}): KpiInput {
  return { today, from, to, batches, lines: [], dateChanges: [], exceptions: [], ...extra };
}

function orderLine(id: string, patch: { readonly stage: LineStage; readonly buyerUserId?: OrderLineLoad['buyerUserId'] }): OrderLineLoad {
  return {
    id: entityId(id),
    buyerUserId: patch.buyerUserId === undefined ? entityId('buyer-1') : patch.buyerUserId,
    lane: 'finished',
    stage: patch.stage,
  };
}

const sample = input([
  batch({ id: entityId('ontime'), status: 'received', firstConfirmedDate: day('2026-10-05'), dateBuyerConfirmed: day('2026-10-05'), receipts: [{ receivedOn: day('2026-10-05'), voidedAt: null }] }),
  batch({ id: entityId('late'), status: 'received', firstConfirmedDate: day('2026-10-01'), dateBuyerConfirmed: day('2026-10-01'), receipts: [{ receivedOn: day('2026-10-08'), voidedAt: null }] }),
  batch({ id: entityId('closed'), status: 'closed', firstConfirmedDate: day('2026-10-02'), dateBuyerConfirmed: day('2026-10-02'), closedAt: '2026-10-03T00:00:00.000Z' }),
  batch({ id: entityId('cancelled'), status: 'cancelled', firstConfirmedDate: day('2026-10-03'), cancelledAt: '2026-10-03T00:00:00.000Z' }),
  batch({ id: entityId('overdue'), status: 'confirmed', firstConfirmedDate: day('2026-10-04'), dateBuyerConfirmed: day('2026-10-04'), statusChangedAt: '2026-10-04T00:00:00.000Z' }),
  batch({ id: entityId('future'), status: 'confirmed', firstConfirmedDate: day('2026-10-20'), dateBuyerConfirmed: day('2026-10-20') }),
  batch({ id: entityId('due-today'), status: 'confirmed', firstConfirmedDate: day('2026-10-12'), dateBuyerConfirmed: day('2026-10-12') }),
  batch({ id: entityId('outside'), status: 'received', firstConfirmedDate: day('2026-09-01'), receipts: [{ receivedOn: day('2026-09-02'), voidedAt: null }] }),
  batch({ id: entityId('voided'), status: 'confirmed', firstConfirmedDate: day('2026-10-06'), dateBuyerConfirmed: day('2026-10-20'), receipts: [{ receivedOn: day('2026-10-06'), voidedAt: '2026-10-07T00:00:00.000Z' }] }),
  batch({ id: entityId('changed'), status: 'confirmed', firstConfirmedDate: day('2026-10-07'), dateBuyerConfirmed: day('2026-10-15'), statusChangedAt: '2026-09-26T00:00:00.000Z' }),
  batch({ id: entityId('first-set'), status: 'confirmed', firstConfirmedDate: day('2026-10-08'), dateBuyerConfirmed: day('2026-10-08') }),
  batch({ id: entityId('noted'), status: 'received', firstConfirmedDate: day('2026-10-09'), dateBuyerConfirmed: day('2026-10-09'), receipts: [{ receivedOn: day('2026-10-09'), voidedAt: null }], shipments: [{ shippedOn: day('2026-10-09'), voidedAt: null }], noteReturnedOn: day('2026-10-11') }),
]);

it('手算样例覆盖准时、晚到、关闭、取消、仍逾期、改期和作废收货', () => {
  const withChanges = input(sample.batches, {
    dateChanges: [
      { field: 'dateBuyerConfirmed', changedAt: '2026-09-01T00:00:00.000Z', isFirstSet: true },
      { field: 'dateBuyerConfirmed', changedAt: '2026-10-09T00:00:00.000Z', isFirstSet: false },
      { field: 'dateBuyerConfirmed', changedAt: '2026-10-08T00:00:00.000Z', isFirstSet: true },
    ],
  });
  expect(dueBatches(sample)).toMatchObject({ numerator: 10, lowSample: false });
  expect(onTimeRate(sample)).toMatchObject({ numerator: 2, denominator: 8, value: 0.25, lowSample: false });
  expect(averageDelay(sample)).toMatchObject({ numerator: 7, denominator: 1, value: 7, lowSample: true });
  expect(currentlyOverdue(sample)).toMatchObject({ numerator: 2 });
  expect(dateChangeCount(withChanges)).toMatchObject({ numerator: 1 });
  expect(noteReturnDays(sample)).toMatchObject({ numerator: 2, denominator: 1, value: 2, lowSample: true });
});

it('K5 不把首次设置算作改期', () => {
  expect(dateChangeCount(input([], { dateChanges: [{ field: 'dateBuyerConfirmed', changedAt: '2026-10-08T00:00:00.000Z', isFirstSet: true }] })).numerator).toBe(0);
});

it('期间末仍开放的异常才计入', () => {
  expect(openExceptionCount(input([], { exceptions: [{ status: 'open', openedAt: '2026-10-01T00:00:00.000Z', closedAt: null }, { status: 'closed', openedAt: '2026-09-01T00:00:00.000Z', closedAt: '2026-10-02T00:00:00.000Z' }] })).numerator).toBe(1);
});

it('近 8 周准时率有 8 个点，口径写明已关闭不算准时、首次设置不算', () => {
  expect(weeklyOnTime(sample)).toHaveLength(8);
  expect(KPI_COPY.k2.definition).toContain('已关闭的批次不算准时');
  expect(KPI_COPY.k5.definition).toContain('首次设置不算');
  expect(KPI_COPY.k8.definition).toContain('未分配异常单列');
});

it('开放批次按卡住天数分桶', () => {
  const table = stuckDistribution(sample.batches, today);
  expect(table.confirmed?.['8-14']).toBe(1);
  expect(table.confirmed?.['15+']).toBe(1);
  expect(table.closed).toBeUndefined();
});

it('D04 样例开放批次是 6，在跟订单行是 1', () => {
  const loads = buyerLoads(input(sample.batches, {
    lines: [orderLine('line-1', { stage: 'awaiting_shipment' })],
  }), [{ buyerUserId: entityId('buyer-1'), on: day('2026-10-10') }]);
  expect(loads[0]).toMatchObject({ buyerUserId: 'buyer-1', openLines: 1, openBatches: 6, followUps: 1 });
});

it('只在跟进里出现、没有在跟订单行时，开放行是 0', () => {
  const loads = buyerLoads(input([], {
    lines: [
      orderLine('done-line', { stage: 'done', buyerUserId: entityId('buyer-2') }),
      orderLine('orphan', { stage: 'awaiting_shipment', buyerUserId: null }),
    ],
  }), [{ buyerUserId: entityId('buyer-2'), on: day('2026-10-10') }]);
  expect(loads).toEqual([{
    buyerUserId: entityId('buyer-2'),
    openLines: 0,
    openBatches: 0,
    overdue: 0,
    dueToday: 0,
    missingDate: 0,
    openExceptions: 0,
    followUps: 1,
  }]);
});

it('四个在跟阶段计入开放行，已完成、未建要货和已取消不计入', () => {
  const loads = buyerLoads(input([batch({ id: entityId('open'), status: 'confirmed' })], {
    lines: [
      orderLine('date', { stage: 'awaiting_date' }),
      orderLine('ship', { stage: 'awaiting_shipment' }),
      orderLine('receipt', { stage: 'awaiting_receipt' }),
      orderLine('partial', { stage: 'partially_received' }),
      orderLine('none', { stage: 'no_batch' }),
      orderLine('done', { stage: 'done' }),
      orderLine('cancelled', { stage: 'cancelled' }),
    ],
  }));
  expect(loads[0]?.openLines).toBe(4);
  expect(loads[0]?.openBatches).toBe(1);
});

it('开放异常只计入它所属的负责人，不复制给其他负责人', () => {
  const loads = buyerLoads(input([], {
    lines: [orderLine('a', { stage: 'awaiting_shipment', buyerUserId: entityId('buyer-a') }), orderLine('b', { stage: 'awaiting_shipment', buyerUserId: entityId('buyer-b') })],
    exceptions: [
      { status: 'open', openedAt: '2026-10-01T00:00:00.000Z', closedAt: null, buyerUserId: entityId('buyer-a') },
      { status: 'open', openedAt: '2026-10-01T00:00:00.000Z', closedAt: null, buyerUserId: null },
    ],
  }));
  expect(loads.map((row) => [row.buyerUserId, row.openExceptions])).toEqual([['buyer-a', 1], ['buyer-b', 0]]);
  expect(unassignedOpenExceptionCount(input([], {
    exceptions: [{ status: 'open', openedAt: '2026-10-01T00:00:00.000Z', closedAt: null, buyerUserId: null }],
  }))).toBe(1);
});
