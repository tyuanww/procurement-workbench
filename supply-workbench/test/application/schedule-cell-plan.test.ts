import { expect, it } from 'vitest';
import { planScheduleCell, SCHEDULE_LINK_REVIEW } from '../../packages/application/src/factory-links/index.js';
import { scheduleBalance, scheduledDayQty } from '../../packages/domain/src/index.js';
import type { FactoryRowMatchRef, OrderLineMatchRef } from '../../packages/application/src/ports/factory-link-views.js';

const line = (id: string, poNorm: string): OrderLineMatchRef => ({
  orderLineId: id, poNorm, itemCodeNorm: null, barcodeNorm: null, linkId: null, linkStatus: null, linkReason: null,
});

it('两个日期格和两个工厂都可以关联同一订单行', () => {
  const lines = [line('line-1', 'PO1')];
  const first = planScheduleCell(cell({ id: 'day-1', poNorm: 'PO1', factoryPartyId: 'factory-a' }), lines);
  const second = planScheduleCell(cell({ id: 'day-2', poNorm: 'PO1', factoryPartyId: 'factory-b' }), lines);
  expect(first).toMatchObject({ kind: 'write', status: 'linked', lineId: 'line-1' });
  expect(second).toMatchObject({ kind: 'write', status: 'linked', lineId: 'line-1' });
});

it('多条订单行保持歧义，没有候选保持未关联，manual 不改', () => {
  const lines = [line('line-1', 'PODUP'), line('line-2', 'PODUP')];
  expect(planScheduleCell(cell({ id: 'amb', poNorm: 'PODUP' }), lines)).toMatchObject({ kind: 'write', status: 'ambiguous', lineId: null, reason: 'FACTORY_LINK_CONFLICT' });
  expect(planScheduleCell(cell({ id: 'none', poNorm: null }), lines)).toMatchObject({ kind: 'write', status: 'unlinked', reason: 'NO_CANDIDATE_LINE' });
  expect(planScheduleCell(cell({ id: 'hand', poNorm: 'PODUP', linkStatus: 'manual', linkedOrderLineId: 'line-9' }), lines)).toEqual({ kind: 'skip' });
});

it('已自动关联时目标变更、消失或变歧义都保持原订单行并待复核', () => {
  const same = planScheduleCell(cell({ id: 'same', poNorm: 'PO1', linkStatus: 'linked', linkedOrderLineId: 'line-1' }), [line('line-1', 'PO1')]);
  expect(same).toMatchObject({ kind: 'write', status: 'linked', lineId: 'line-1', reason: null });
  const moved = planScheduleCell(cell({ id: 'moved', poNorm: 'PO2', linkStatus: 'linked', linkedOrderLineId: 'line-1' }), [line('line-2', 'PO2')]);
  expect(moved).toEqual({ kind: 'keep', lineId: 'line-1', reason: SCHEDULE_LINK_REVIEW });
  const gone = planScheduleCell(cell({ id: 'gone', poNorm: null, linkStatus: 'linked', linkedOrderLineId: 'line-1' }), [line('line-1', 'PO1')]);
  expect(gone).toEqual({ kind: 'keep', lineId: 'line-1', reason: SCHEDULE_LINK_REVIEW });
  const split = planScheduleCell(cell({ id: 'split', poNorm: 'PODUP', linkStatus: 'linked', linkedOrderLineId: 'line-1' }), [line('line-1', 'PODUP'), line('line-2', 'PODUP')]);
  expect(split).toEqual({ kind: 'keep', lineId: 'line-1', reason: SCHEDULE_LINK_REVIEW });
});

it('总需求、已排产、已发货、已收货互不覆盖，超量只是提醒', () => {
  const cells = [
    { linkStatus: 'linked', qty: 6 },
    { linkStatus: 'manual', qty: 5 },
    { linkStatus: 'ambiguous', qty: 100 },
    { linkStatus: 'linked', qty: null },
  ];
  expect(scheduledDayQty(cells)).toBe(11);
  const balance = scheduleBalance({ ordered: 10, scheduled: 11, shipped: 3, received: 2 });
  expect(balance).toEqual({ ordered: 10, scheduled: 11, shipped: 3, received: 2, over: true });
  expect(scheduleBalance({ ordered: 10, scheduled: 11, shipped: 99, received: 99 }).shipped).toBe(99);
  expect(scheduleBalance({ ordered: null, scheduled: 11, shipped: 3, received: 2 }).over).toBe(false);
});

function cell(input: { readonly id: string; readonly poNorm: string | null; readonly factoryPartyId?: string; readonly linkStatus?: string; readonly linkedOrderLineId?: string | null }): FactoryRowMatchRef {
  return {
    rowId: input.id,
    kind: 'schedule',
    factoryPartyId: input.factoryPartyId ?? 'factory-1',
    poNorm: input.poNorm,
    itemCodeNorm: null,
    barcodeNorm: null,
    poRaw: input.poNorm,
    itemCodeRaw: null,
    barcodeRaw: null,
    linkStatus: input.linkStatus ?? 'unlinked',
    linkReason: null,
    linkedOrderLineId: input.linkedOrderLineId ?? null,
  };
}
