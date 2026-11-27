// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { BatchViewSchema, type BatchView } from '../../packages/contracts/src/index.js';
import { localDate } from '../../packages/domain/src/index.js';
import { BatchOverview } from '../../apps/web/src/pages/progress/procurement-batch-overview.js';
import type { WeeklyOrderDelivery } from '../../apps/web/src/pages/progress/planning-batches.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { act, button, click, element, installMatchMedia, mount, resetDom, textOf } from './party-preview-dom.js';

const confirmed = localDate('2026-11-23');
const base = BatchViewSchema.parse({
  id: 'batch-1', orderLineId: 'line-1', seq: 1, plannedQty: 18_000, receiverPartyId: 'warehouse-1',
  dateFactoryRequired: '2026-11-22', dateSupplierPromised: null, dateBuyerConfirmed: confirmed, firstConfirmedDate: '2026-11-20',
  confirmedBy: 'buyer', confirmedAt: confirmed, status: 'confirmed', statusChangedAt: confirmed, origin: 'manual', originRef: null,
  closedAt: null, closedReason: null, cancelledAt: null, cancelReason: null, shipments: [], receipts: [],
  deliveryNote: null, shippedQty: null, receivedQty: null, qtyVariance: null, noteStatus: 'missing',
  overdueDays: 4, daysInStage: 2, dateChanges: [],
});

const fulfillment: NonNullable<BatchView['fulfillment']> = {
  unit: '件', unshippedQty: 6_000, inTransitQty: 8_000, receivedQty: 4_000, verifiedShippedQty: 12_000, verifiedReceivedQty: 4_000,
  overShippedQty: 0, overReceivedQty: 0, receiptWithoutShipmentQty: 0, reviewCount: 0,
};
const delivery = {
  timing: 'overdue', supplier: null,
  actions: [{ kind: 'expedite', qty: 6_000, unit: '件' }, { kind: 'check-receipt', reason: 'checked-shipment' }],
} satisfies WeeklyOrderDelivery;

it('批次摘要区分两种待办和已核实的收货事实，来源按需展开', () => {
  const receipt = {
    id: 'receipt-1', batchId: 'batch-1', qty: 4_000, receivedOn: confirmed, category: 'finished', source: 'workbench',
    fulfillment: { kind: 'received', disposition: 'normal', unit: '件', evidence: '仓库签收单 ABC', reviewReason: null },
    createdBy: 'buyer', note: null, voidedAt: null, voidedBy: null, voidReason: null,
  } satisfies BatchView['receipts'][number];
  checkOverview({ batch: { ...base, fulfillment, receipts: [receipt] } }, () => {
    const summary = document.querySelector('[aria-label="当前待办"]')?.parentElement;
    expect(summary?.textContent).toMatch(/欠收量14,000件计划 18,000 件确认实收 4,000 件/);
    expect([...document.querySelectorAll('[aria-label="当前待办"] li')].map((item) => item.textContent)).toEqual([
      '催发货 6,000 件', '核对在途待收 8,000 件',
    ]);
    expect(textOf('body')).toContain('代工厂需求日 2026-11-22 早于采购确认到货日');
    expect(textOf('body')).not.toContain('仓库签收单 ABC');
    const disclosure = document.querySelector('[role="button"][aria-expanded="false"]');
    if (!(disclosure instanceof HTMLElement)) throw new Error('找不到发收货凭据折叠入口');
    expect(disclosure.textContent).toContain('1 条已核实');
    click(disclosure);
    expect(textOf('body')).toContain('仓库签收单 ABC');
  });
});

it('确认零实收不是缺量；缺单位时不计算欠收或给零实收，无凭据直接说明', () => {
  checkOverview({ batch: { ...base, fulfillment: { ...fulfillment, receivedQty: 0 }, firstConfirmedDate: confirmed } }, () => {
    expect(textOf('body')).toMatch(/欠收量18,000件计划 18,000 件确认实收 0 件/);
    expect(textOf('body')).not.toContain('首次采购确认到货日');
  });
  checkOverview({ batch: { ...base, fulfillment: { ...fulfillment, unit: null, receivedQty: null } } }, () => {
    expect(textOf('body')).toMatch(/欠收量—数量待核实计划 18,000（单位待核）实收待核实/);
    expect(textOf('body')).not.toContain('确认实收 0');
    expect(textOf('body')).toContain('暂无已核实的发货或收货凭据。');
    expect(document.querySelector('[role="button"][aria-expanded]')).toBeNull();
  });
});

it('供应商承诺日默认只读，采购需主动进入编辑，取消还原焦点，闭合批次不再给入口', () => {
  checkOverview({ batch: base, role: 'buyer' }, () => {
    expect(textOf('body')).toContain('供应商承诺日未登记');
    expect(document.querySelector('input')).toBeNull();
    click(button('登记承诺日'));
    expect(document.activeElement).toBe(document.querySelector('input'));
    expect(button('保存承诺日').disabled).toBe(true);
    click(button('取消'));
    expect(document.querySelector('input')).toBeNull();
    expect(document.activeElement).toBe(button('登记承诺日'));
  });
  checkOverview({ batch: base }, () => expect(textOf('body')).not.toContain('登记承诺日'));
  checkOverview({ batch: { ...base, status: 'closed', closedAt: confirmed }, role: 'buyer' }, () => {
    expect(textOf('body')).not.toContain('登记承诺日');
  });
});

function checkOverview({ batch, role = 'manager' }: { readonly batch: BatchView; readonly role?: 'buyer' | 'manager' }, assertion: () => void) {
  installMatchMedia();
  const view = mount(element(ActorRoles, { roles: [role], children: element(BatchOverview, {
    batch, delivery: batch.fulfillment?.unit == null ? undefined : delivery, dependencies: undefined, onChanged: vi.fn(),
  }) }));
  try {
    assertion();
  } finally {
    act(() => view.unmount());
    resetDom();
  }
}
