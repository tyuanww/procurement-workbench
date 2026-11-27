// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import type { DeliveryScheduleBatch } from '../../packages/contracts/src/index.js';
import { localDate } from '../../packages/domain/src/index.js';
import { emptyScheduleFilters } from '../../apps/web/src/features/progress/index.js';
import { PlanningTimeline } from '../../apps/web/src/pages/progress/progress-timeline.js';
import { weeklyDelivery } from '../../apps/web/src/pages/progress/weekly-delivery.js';
import { act, click, element, mount, resetDom } from './party-preview-dom.js';

const today = localDate('2026-11-27');
const confirmed = localDate('2026-11-23');
const window = { from: confirmed, to: localDate('2026-11-29') };
const zeroReceipt: DeliveryScheduleBatch = {
  id: 'zero-receipt', seq: 1, orderLineId: 'line-1', orderName: '合成洁面乳', poRaw: 'PO-1', itemCode: null, oaRef: null,
  buyer: { id: 'buyer', name: '采购甲' }, supplier: { id: 'supplier', name: '合成工厂' }, factory: null,
  confirmed, firstConfirmed: localDate('2026-11-20'), required: localDate('2026-11-22'), supplierPromised: null,
  receiptDates: [], status: 'confirmed', plannedQty: 10_000,
  fulfillment: { unit: '件', receivedQty: 0, unshippedQty: 6_000, reviewCount: 0 },
};
const unknownReceipt: DeliveryScheduleBatch = {
  ...zeroReceipt, id: 'unknown-receipt', seq: 2, firstConfirmed: confirmed, required: null,
  fulfillment: { ...zeroReceipt.fulfillment, receivedQty: null, unshippedQty: null, reviewCount: 1 },
};

it('周批次列表保留改期、区别零实收和待核实，两种待办共用一个批次入口', () => {
  const { groups } = weeklyDelivery({ batches: [zeroReceipt, unknownReceipt], items: [], conflicts: {}, orders: [],
    window, today, filters: emptyScheduleFilters(), keyword: '' });
  const onOpen = vi.fn();
  const root = mount(element(PlanningTimeline, { groups, window, today, scale: 'week', isList: true, selectedRow: null, onOpen }));
  try {
    const zero = batchButton('合成洁面乳 · 批次 1');
    const unknown = batchButton('合成洁面乳 · 批次 2');
    expect(zero.textContent).toContain('逾期 4 天');
    expect(zero.textContent).toContain('催发货 6,000 件 · 核对收货记录');
    expect(zero.textContent).toContain('确认实收 0 件');
    expect(zero.textContent).toContain('原交期 11-20');
    expect(zero.textContent).toContain('交期冲突 · 工厂要求 11-22');
    expect(zero.textContent).not.toContain('其中未发 6,000 件');
    expect(unknown.textContent).toContain('信息待核');
    expect(unknown.textContent).toContain('实收待核实');
    expect(unknown.textContent).not.toMatch(/确认实收 0 件|原交期|交期冲突/);
    click(zero);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      kind: 'batch', batch: expect.objectContaining({ id: 'zero-receipt' }),
    }), zero.id);
  } finally {
    act(() => root.unmount());
    resetDom();
  }
});

function batchButton(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].filter((item) => item.textContent.includes(label));
  const [entry] = found;
  if (found.length !== 1 || entry === undefined) throw new Error(`预期「${label}」有一个批次入口`);
  expect(entry.textContent).toContain('查看批次');
  expect(entry.querySelector('button, a')).toBeNull();
  return entry;
}
