// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { ActionAssistant } from '../../apps/web/src/pages/today/ActionAssistant.js';
import { todayBoard, toBoardItem, type ReceiptWork } from '../../apps/web/src/features/today/index.js';
import { act, button, click, element, installMatchMedia, mount, resetDom, textOf } from './party-preview-dom.js';
import { antdApp, batchTodo, pageBody } from './today-workspace-fixture.js';

it('第二页按批次的今日等待方计数，部分到仓仍提示核对实收，排期和其他待办不占批次', () => {
  installMatchMedia();
  const supplier = batchTodo(1);
  const receipt = batchTodo(2);
  if (receipt.line === null || receipt.batch === null) throw new Error('缺少样例批次');
  const memo: ReceiptWork = { batchId: receipt.batch.id, batchSeq: 2, line: receipt.line, warehouse: '合成仓',
    confirmedDate: null, status: 'overdue', inTransitQty: 4, receivedQty: 2, unit: '件' };
  const board = todayBoard({
    items: [toBoardItem(supplier), toBoardItem({ ...receipt, reasons: ['shipped_not_received', 'unshipped'],
      batch: { ...receipt.batch, status: 'partially_received', shippedQty: 6, receivedQty: 2 } }),
      toBoardItem({ ...batchTodo(3), id: 'review:example', subject: 'review', batch: null, waitingOn: { kind: 'internal', partyId: null } })],
    reasons: [], group: 'priority', buyerName: '采购甲',
  });
  const page = { paging: { ...pageBody(53).paging, page: 2 }, reasons: [], work: undefined, isLoading: false, isSettled: true, loadError: '' };
  const props = { page, board, receipts: new Map([[receipt.id, memo]]), planCount: 1,
    onOverdue: () => undefined, onFollowUp: () => undefined, onPlan: () => undefined };
  const root = mount(antdApp(element(ActionAssistant, props)));
  try {
    expect(textOf('aside dl')).toBe('供应商2 批');
    expect(textOf('aside')).toContain('本页批次等待方');
    expect(textOf('aside p')).toBe('先核对到仓逾期批次的实收数量。');
    expect(textOf('aside')).toContain('我的到期排期 1 项');
    const batchRow = document.createElement('li');
    batchRow.id = 'today-row-' + receipt.id;
    batchRow.tabIndex = -1;
    document.body.append(batchRow);
    click(button('定位逾期核收'));
    expect(document.activeElement).toBe(batchRow);
    act(() => root.render(antdApp(element(ActionAssistant, { ...props, page: { ...page, work: 'factory_chase' } }))));
    expect(textOf('aside p')).toContain('发货安排');
    expect(textOf('aside')).not.toContain('定位逾期核收');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
  }
});
