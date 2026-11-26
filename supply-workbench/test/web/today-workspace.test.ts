// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import type { TodayPageResponse, TodoItemView } from '../../packages/contracts/src/index.js';
import { localDate } from '../../packages/domain/src/index.js';
import type { DailyPlan, WorkItem } from '../../apps/web/src/features/today/index.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, button, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, waitFor } from './party-preview-dom.js';
import { antdApp, batchTodo, LocationAndToday, pageBody } from './today-workspace-fixture.js';

it('同批未发且到时核收只显示一次，主操作打开对应订单并保留跟进约定', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?view=board'));
  const mixed = batchTodo(1);
  if (mixed.batch === null || mixed.line === null) throw new Error('缺少样例批次');
  const due = localDate('2026-11-20');
  const batch: TodoItemView = {
    ...mixed, reasons: ['shipped_not_received', 'note_missing'], dueDate: due, waitingOn: { kind: 'internal', partyId: null },
    reminderTarget: { kind: 'supplier', name: '样例工厂' },
    batch: { ...mixed.batch, plannedQty: 1100, status: 'partially_received', nextFollowUpAt: '2026-11-22T01:00:00.000Z',
      latestFollowUp: { id: 'last-note', text: '回查最近一次催货记录', createdAt: '2026-11-20T01:00:00.000Z' },
      fulfillment: { unit: '件', unshippedQty: 800, inTransitQty: 300, receivedQty: 0, verifiedShippedQty: 300,
        verifiedReceivedQty: 0, overShippedQty: 0, overReceivedQty: 0, receiptWithoutShipmentQty: 0, reviewCount: 0 } },
  };
  const arrivalMemos: TodayPageResponse['arrivalMemos'] = [{
    batchId: mixed.batch.id, batchSeq: 1, line: mixed.line, warehouse: '上海仓',
    confirmedDate: due, status: 'overdue', inTransitQty: 300, receivedQty: 0, unit: '件',
  }];
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'inbox=today', status: 200, body: { ...pageBody(1), items: [batch], arrivalMemos } });
    });
    expect(document.querySelectorAll('.today-row')).toHaveLength(1);
    const receipt = document.querySelector('[aria-label="核对收货"] .today-row');
    if (receipt === null) throw new Error('没有核收卡片');
    const primary = receipt.querySelector('.ant-btn-primary');
    if (primary === null) throw new Error('没有核收主操作');
    expect(receipt.textContent).toContain('未发 800 件');
    expect(receipt.textContent).toContain('在途待收 300 件');
    expect(receipt.textContent).toContain('下次跟进 · 2026-11-22');
    expect(primary.getAttribute('href')).toBe('/lines/line?focusBatch=batch-1');
    expect(primary.textContent).toBe('核对收货');
    expect(receipt.textContent).not.toContain('复制本批催单');
    const facts = receipt.textContent ?? '';
    expect(facts).toMatch(/同名样品.*单号 PO.*第 1 批.*到仓逾期.*采购确认到仓日 2026-11-20.*收货方 上海仓.*核对收货.*今日等待方 · 内部（等回单）.*下次跟进.*催货 · 样例工厂/);
    expect(facts).not.toContain('回查最近一次催货记录');
    click(button('查看详情'));
    await waitFor(() => textOf('[role="dialog"]').includes('最近跟进 · 回查最近一次催货记录'));
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

it('今天的范围和日历计数包含本人排期和待建首批，分页后可直接跳回且不重复卡片', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?view=calendar&page=2'));
  const first = batchTodo(1);
  const task = planTask('buyer-1', '本人里程碑');
  const otherTask = planTask('buyer-2', '他人里程碑');
  const date = localDate('2026-11-21');
  const daily: DailyPlan = { date, asOf: date, total: 2, overdueCount: 0, items: [task, otherTask], byOwner: [], bySupplier: [], byFactory: [] };
  const base = pageBody(51);
  const pendingBatch: TodayPageResponse['pendingBatch'] = [{
    orderLineId: 'pending-first-batch', poRaw: 'PO-待建', nameRaw: '首批待建样品', qtyOrdered: 100, unit: '件', missingFields: [], action: 'create',
  }];
  const response = (page: number) => ({ ...base, items: [first], pendingBatch,
    paging: { ...base.paging, page, pendingCount: 1, calendar: { date, days: [{ date, count: 51 }] } } });
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'page=2', status: 200, body: response(2) });
    });
    expect(button('今天要办—')).toBeDefined();
    expect(textOf('[aria-label="工作台日历"]')).not.toContain('51项');
    await act(() => { fulfill({ urlPart: '/api/v1/plan/daily', status: 200, body: daily }); });
    expect(button('今天要办53项')).toBeDefined();
    expect(textOf('[aria-label="工作台日历"]')).toContain('53项');
    expect(textOf('#today-chase')).not.toContain('首批待建样品');
    expect(textOf('#today-chase')).not.toContain('本人里程碑');
    const jump = document.querySelector<HTMLAnchorElement>('a[href="#today-pending-batches"]');
    if (jump === null) throw new Error('没有待建跳转');
    click(jump);
    await act(() => { fulfill({ urlPart: 'page=1', status: 200, body: response(1) }); });
    expect(button('今天要办53项')).toBeDefined();
    expect(document.querySelectorAll('#today-pending-batches')).toHaveLength(1);
    expect(document.activeElement?.id).toBe('today-pending-batches');
    expect(textOf('#today-chase')).toContain('本人里程碑');
    expect(textOf('#today-chase')).not.toContain('他人里程碑');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

it('日历提前显示未来预约，空日期可从今天入口返回业务日', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?view=calendar'));
  const date = localDate('2026-11-21');
  const tomorrow = localDate('2026-11-22');
  const yesterday = localDate('2026-11-20');
  const base = pageBody(1);
  const daily: DailyPlan = { date, asOf: date, total: 0, overdueCount: 0, items: [], byOwner: [], bySupplier: [], byFactory: [] };
  const today = { ...base, items: [batchTodo(1)], paging: { ...base.paging, calendar: { date, days: [{ date, count: 1 }], scheduledDays: [{ date: tomorrow, count: 1 }] } } };
  const past = { ...today, items: [], paging: { ...today.paging, total: 0, calendar: { ...today.paging.calendar, date: yesterday } } };
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'calendar=today', status: 200, body: today });
    });
    await act(() => { fulfill({ urlPart: '/api/v1/plan/daily', status: 200, body: daily }); });
    click(calendarCell(yesterday));
    await act(() => { fulfill({ urlPart: 'calendar=2026-11-20', status: 200, body: past }); });
    expect(textOf('#today-chase')).toContain('这天没有待办');
    click(button('今天要办1项'));
    expect(new URLSearchParams(textOf('output')).has('date')).toBe(false);
    await act(() => { fulfill({ urlPart: 'calendar=today', status: 200, body: today }); });
    expect(calendarCell(date).textContent).toContain('1项');
    expect(calendarCell(tomorrow).textContent).toContain('1批');
    expect(document.querySelector('[role="combobox"][aria-label="日历年份"]')).not.toBeNull();
    expect(document.querySelector('[role="combobox"][aria-label="日历月份"]')).not.toBeNull();
    click(calendarCell(tomorrow));
    const params = new URLSearchParams(textOf('output'));
    expect(params.get('inbox')).toBe('scheduled');
    expect(params.get('date')).toBe(tomorrow);
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

function calendarCell(date: string): HTMLElement {
  const cell = document.querySelector<HTMLElement>(`[aria-label="工作台日历"] td[title="${date}"]`);
  if (cell === null) throw new Error('没有显示该日');
  return cell;
}

function planTask(ownerUserId: string, title: string): WorkItem {
  const date = localDate('2026-11-21');
  return { id: ownerUserId, ownerUserId, ownerName: null, title, subjectType: 'order_line', subjectId: 'line', kind: 'milestone',
    counterpartyPartyId: null, counterpartyRole: null, counterpartyName: null, plannedStart: date, plannedEnd: date,
    status: 'planned', priority: 'normal', source: 'batch_milestone', parentId: null, version: 1, overdueDays: null,
    orderLine: null, batch: null, supplierPartyId: null, supplierName: null, factoryPartyId: null, factoryName: null };
}

it('旧今日深链定位到已约跟进的实际日期，抽屉仍打开同一批', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?view=calendar&drawer=batch%3Abatch-1'));
  const base = pageBody(0);
  const reminder = batchTodo(1);
  const scheduled = {
    ...base, items: [reminder],
    paging: { ...base.paging, total: 1, focusInbox: 'scheduled', focusDay: '2026-11-22',
      calendar: { date: '2026-11-22', days: [{ date: '2026-11-22', count: 1 }] } },
  };
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'calendar=today', status: 200,
        body: { ...base, paging: { ...base.paging, focusInbox: 'scheduled', focusDay: '2026-11-22' } } });
    });
    expect(new URLSearchParams(textOf('output')).get('drawer')).toBe(reminder.id);
    await act(() => { fulfill({ urlPart: 'inbox=scheduled&calendar=2026-11-22', status: 200, body: scheduled }); });
    await waitFor(() => textOf('[role="dialog"]').includes('同名样品'));
    expect(textOf('[aria-label="工作台日历"]')).toContain('1批');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});
