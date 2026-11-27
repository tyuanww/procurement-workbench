// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import type { DeliveryScheduleBatch } from '../../packages/contracts/src/index.js';
import { localDate } from '../../packages/domain/src/index.js';
import { emptyScheduleFilters } from '../../apps/web/src/features/progress/index.js';
import type { WorkItem } from '../../apps/web/src/features/today/index.js';
import { planningGroups } from '../../apps/web/src/pages/progress/planning-rows.js';
import { PlanningTimeline } from '../../apps/web/src/pages/progress/progress-timeline.js';
import { weeklyDelivery } from '../../apps/web/src/pages/progress/weekly-delivery.js';
import { act, button, click, element, mount, resetDom, textOf } from './party-preview-dom.js';

const today = localDate('2026-11-27');
const confirmed = localDate('2026-11-24');
const week = { from: localDate('2026-11-23'), to: localDate('2026-11-29') };
const partial: DeliveryScheduleBatch = {
  id: 'partial', seq: 1, orderLineId: 'line-1', orderName: '合成洁面乳', poRaw: 'PO-1', itemCode: null, oaRef: null,
  buyer: { id: 'buyer', name: '采购甲' }, supplier: { id: 'supplier', name: '合成工厂' }, factory: null,
  confirmed, firstConfirmed: localDate('2026-11-21'), required: null, supplierPromised: null,
  receiptDates: [confirmed, confirmed], status: 'partially_received', plannedQty: 10_000,
  fulfillment: { unit: '件', receivedQty: 4_000, unshippedQty: 6_000, reviewCount: 0 },
};
const risk: DeliveryScheduleBatch = {
  ...partial, id: 'risk', seq: 2, poRaw: 'PO-2', confirmed: null, firstConfirmed: null, required: localDate('2026-12-01'),
  receiptDates: [], status: 'awaiting_date', fulfillment: { ...partial.fulfillment, receivedQty: null, unshippedQty: null },
};
const upcoming: DeliveryScheduleBatch = {
  ...partial, id: 'upcoming', seq: 3, poRaw: 'PO-3', confirmed: localDate('2026-11-29'), firstConfirmed: null,
  receiptDates: [], status: 'confirmed', fulfillment: { ...partial.fulfillment, receivedQty: null, unshippedQty: null },
};

function renderGantt(batches: readonly DeliveryScheduleBatch[], window = week) {
  const { groups } = weeklyDelivery({ batches, items: [], conflicts: {}, orders: [],
    window, today, filters: emptyScheduleFilters(), keyword: '' });
  const onOpen = vi.fn();
  const root = mount(element(PlanningTimeline, { groups, window, today, scale: 'week', isList: false, compactWeek: true, selectedRow: null, onOpen }));
  return { root, onOpen };
}

it('订单周甘特同日的采购确认与实际收货分别打开同一批次，重复实收日期只提供一个入口', () => {
  const { root, onOpen } = renderGantt([partial, upcoming]);
  try {
    const title = batchTrigger('partial');
    expect(title.textContent).toContain('逾期 3 天');
    expect(title.textContent).toContain('PO-1部分收货');
    expect(title.textContent).not.toMatch(/合成工厂|采购甲|4,000|催发货/);
    expect(batchTrigger('upcoming').textContent).toContain('尚未到期');
    const due = button('合成洁面乳 · 批次 1 · 采购确认 2026-11-24');
    const received = button('合成洁面乳 · 批次 1 · 实际收货 2026-11-24');
    const elapsed = button('合成洁面乳 · 批次 1 · 逾期待收 3 天 · 采购确认 2026-11-24，已过时段 2026-11-25 至 2026-11-27');
    expect(batchTriggers('partial')).toHaveLength(4);
    expect(due.id).toBe('planning-row:batch:partial-point-2026-11-24-confirmed');
    expect(received.id).toBe('planning-row:batch:partial-point-2026-11-24-received');
    expect(elapsed.id).toBe('planning-row:batch:partial-interval');
    for (const target of [title, due, received, elapsed]) {
      click(target);
      expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'batch', batch: expect.objectContaining({ id: 'partial' }) }), target.id);
    }
    expect(textOf('[aria-label="甘特图图例"]')).toBe('采购确认实际收货逾期待收');
  } finally {
    act(() => root.unmount());
    resetDom();
  }
});

it('订单周甘特在行内保留窗外风险或逾期确认日，没进入观察周的日期不生成图内标记', () => {
  const current = renderGantt([risk]);
  try {
    expect(batchTrigger('risk').textContent).toContain('下周风险 12-01');
    expect(batchTriggers('risk')).toHaveLength(1);
    expect(document.querySelector('[aria-label="甘特图图例"]')).toBeNull();
  } finally {
    act(() => current.root.unmount());
    resetDom();
  }

  const future = renderGantt([partial], { from: localDate('2026-11-30'), to: localDate('2026-12-06') });
  try {
    const title = batchTrigger('partial');
    expect(title.textContent).toContain('采购确认 11-24');
    expect(title.textContent).not.toContain('11-21');
    expect(batchTriggers('partial')).toHaveLength(1);
  } finally {
    act(() => future.root.unmount());
    resetDom();
  }
});

it('订单周甘特用点呈现已标识的单日里程碑，同日任务仍保留任务计划条', () => {
  const item: WorkItem = {
    id: 'task', title: '验样', kind: 'task', subjectType: 'standalone', subjectId: null,
    ownerUserId: null, ownerName: null, counterpartyPartyId: null, counterpartyRole: null, counterpartyName: null,
    plannedStart: confirmed, plannedEnd: confirmed, status: 'planned', priority: 'normal', source: 'manual',
    parentId: null, version: 0, overdueDays: null, orderLine: null, batch: null,
    supplierPartyId: null, supplierName: null, factoryPartyId: null, factoryName: null,
  };
  const milestone = { ...item, id: 'milestone', title: '确认样品', kind: 'milestone' } satisfies WorkItem;
  const groups = planningGroups({ scope: 'orders', items: [item, milestone], development: null, orders: [], selectedBatches: [],
    window: week, today, filters: emptyScheduleFilters(), query: '', conflicts: {} });
  const onOpen = vi.fn();
  const root = mount(element(PlanningTimeline, { groups, window: week, today, scale: 'week', isList: false, compactWeek: true, selectedRow: null, onOpen }));
  try {
    const point = button('确认样品 · 里程碑 2026-11-24');
    expect(point.id).toMatch(/-point-2026-11-24-milestone$/);
    expect(button('验样 · 任务计划 2026-11-24').id).toMatch(/-interval$/);
    expect(document.querySelector('button[aria-label^="确认样品 · 任务计划"]')).toBeNull();
    expect(textOf('[aria-label="甘特图图例"]')).toBe('任务计划里程碑');
    click(point);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith({ kind: 'task', item: milestone }, point.id);
  } finally {
    act(() => root.unmount());
    resetDom();
  }
});

function batchTrigger(id: string): HTMLButtonElement {
  const target = document.getElementById(`planning-row:batch:${id}`);
  if (!(target instanceof HTMLButtonElement)) throw new Error(`没有批次入口 ${id}`);
  return target;
}

function batchTriggers(id: string): HTMLButtonElement[] {
  return [...document.querySelectorAll<HTMLButtonElement>(`button[id^="planning-row:batch:${id}"]`)];
}
