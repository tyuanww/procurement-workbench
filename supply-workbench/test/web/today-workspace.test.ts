// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import type { TodayPageResponse, TodoItemView } from '../../packages/contracts/src/index.js';
import { localDate } from '../../packages/domain/src/index.js';
import type { DailyPlan, WorkItem } from '../../apps/web/src/features/today/index.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { act, button, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, waitFor } from './party-preview-dom.js';
import { antdApp, batchTodo, LocationAndToday, pageBody } from './today-workspace-fixture.js';

it('同批未发且到时核收只显示一次，先打开本页核收抽屉并保留跟进约定', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const tree = element(ActorRoles, { roles: ['buyer'], children: element(LocationAndToday) });
  const root = mount(memoryRouter(antdApp(tree), '/today?view=board&focusId=batch%3Abatch-1'));
  const mixed = batchTodo(2);
  if (mixed.batch === null || mixed.line === null) throw new Error('缺少样例批次');
  const due = localDate('2026-11-20');
  const batch: TodoItemView = {
    ...mixed, reasons: ['shipped_not_received', 'unshipped', 'demand_before_confirmed'], dueDate: due,
    waitingOn: { kind: 'supplier', partyId: 'sample-factory' },
    waitingOnParty: { id: 'sample-factory', displayName: '样例工厂', rawName: null },
    reminderTarget: { kind: 'supplier', name: '样例工厂' },
    batch: { ...mixed.batch, plannedQty: 1100, status: 'partially_received', nextFollowUpAt: '2026-11-22T01:00:00.000Z',
      latestFollowUp: { id: 'last-note', text: '回查最近一次催货记录', createdAt: '2026-11-20T01:00:00.000Z' },
      fulfillment: { unit: '件', unshippedQty: 800, inTransitQty: 300, receivedQty: 0, verifiedShippedQty: 300,
        verifiedReceivedQty: 0, overShippedQty: 0, overReceivedQty: 0, receiptWithoutShipmentQty: 0, reviewCount: 0 } },
  };
  const arrivalMemos: TodayPageResponse['arrivalMemos'] = [{
    batchId: mixed.batch.id, batchSeq: 2, line: mixed.line, warehouse: '上海仓',
    confirmedDate: due, status: 'overdue', inTransitQty: 300, receivedQty: 0, unit: '件',
  }];
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      const snapshot = pageBody(2);
      fulfill({ urlPart: 'inbox=today', status: 200, body: {
        ...snapshot, items: [batchTodo(1), batch], arrivalMemos, paging: { ...snapshot.paging, chaseItemIds: [batch.id] },
      } });
    });
    expect(document.querySelectorAll('.today-row')).toHaveLength(2);
    expect(document.querySelectorAll('[aria-label="核对收货"] .today-row')).toHaveLength(1);
    const receipt = document.querySelector('[aria-label="核对收货"] .today-row');
    if (receipt === null) throw new Error('没有核收卡片');
    const primary = receipt.querySelector('.today-action-primary');
    if (!(primary instanceof HTMLButtonElement)) throw new Error('没有本页核收主操作');
    expect(receipt.textContent).toContain('未发 800 件');
    expect(receipt.textContent).toContain('在途待收 300 件');
    expect(primary.textContent).toBe('核对收货');
    expect(receipt.textContent).not.toContain('复制本批催单');
    const facts = receipt.textContent ?? '';
    expect(receipt.closest('article')?.getAttribute('aria-label')).toBe('PO · 同名样品 · 第 2 批');
    expect(facts).toMatch(/到仓逾期.*同名样品.*PO · 第 2 批 · 样例工厂.*需求早于确认.*采购确认到仓日 (?:2026-)?11-20.*收货方 上海仓.*核对收货/);
    expect(receipt.querySelector('time[aria-label="2026-11-20 星期五"]')).not.toBeNull();
    expect(facts).not.toMatch(/仍待发|已发待收|下次跟进|回查最近一次催货记录/);
    click(primary);
    await waitFor(() => textOf('[role="dialog"]').includes('最近跟进 · 回查最近一次催货记录'));
    const detail = textOf('[role="dialog"]');
    expect(detail).toContain('收货方 · 上海仓');
    expect(detail).toContain('催货对象 · 样例工厂');
    expect(detail).toContain('下次跟进 · 2026-11-22');
    expect(detail).toContain('催货 · 样例工厂');
    const address = readBatchRecordLink();
    expect(address.pathname).toBe('/lines/line');
    expect(address.searchParams.get('focusBatch')).toBe('batch-2');
    expect(new URLSearchParams(address.searchParams.get('backToToday') ?? '').get('drawer')).toBe(batch.id);
    expect(new URLSearchParams(textOf('output')).has('focusId')).toBe(false);
    const copyQuery = 'itemId=batch%3Abatch-2';
    click(button('复制本批催单'));
    await act(() => { fulfill({ urlPart: copyQuery, status: 200, body: [] }); });
    expect(textOf('[role="dialog"] [role="status"]')).toContain('当前条件没有可复制的催单。');
    click(button('复制本批催单'));
    await act(() => { fulfill({ urlPart: copyQuery, status: 500, body: {} }); });
    expect(textOf('[role="dialog"] [role="status"]')).toContain('复制催单失败，请重试。');
    const ship = button('登记发货');
    expect(ship.classList.contains('ant-btn-variant-text')).toBe(true);
    click(ship);
    await waitFor(() => new URLSearchParams(textOf('output')).get('draft') === 'ship');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

function readBatchRecordLink() {
  const drawer = document.querySelector('[role="dialog"]');
  const link = [...(drawer?.querySelectorAll('a') ?? [])].find((anchor) => anchor.textContent === '核对本批记录');
  if (link === undefined) throw new Error('没有核对本批记录入口');
  return new URL(link.href);
}

it('工作台不显示混合总数，日历日期计数保留本人排期和待建首批', async () => {
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
    expect(document.querySelector('.today-workspace-heading h2')?.getAttribute('aria-label')).toBe('我的行动清单');
    expect(textOf('[aria-label="工作台日历"]')).not.toContain('51项');
    expect(textOf('[aria-label="2026-11-21 星期六 待办"] [role="status"]')).toBe('正在统计待办…');
    await act(() => { fulfill({ urlPart: '/api/v1/plan/daily', status: 200, body: daily }); });
    expect(document.querySelector('.today-workspace-heading h2')?.getAttribute('aria-label')).toBe('我的行动清单');
    expect(textOf('[aria-label="工作台日历"]')).toContain('53项');
    expect(textOf('[aria-label="2026-11-21 星期六 待办"] [role="status"]')).toBe('53 项 · 第 2 页');
    expect(textOf('#today-chase')).not.toContain('首批待建样品');
    expect(textOf('#today-chase')).not.toContain('本人里程碑');
    click(button('待建批次1行'));
    await waitFor(() => !new URLSearchParams(textOf('output')).has('page'));
    await act(() => { fulfill({ urlPart: 'page=1', status: 200, body: response(1) }); });
    expect(document.querySelector('.today-workspace-heading h2')?.getAttribute('aria-label')).toBe('我的行动清单');
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

it('浏览年月保留当前结果，选择日期才切换待办结果或已约跟进', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?view=calendar'));
  const date = localDate('2026-11-21');
  const tomorrow = localDate('2026-11-22');
  const yesterday = localDate('2026-11-20');
  const base = pageBody(1);
  const daily: DailyPlan = { date, asOf: date, total: 0, overdueCount: 0, items: [], byOwner: [], bySupplier: [], byFactory: [] };
  const today = { ...base, items: [batchTodo(1)], paging: { ...base.paging, pendingCount: 0, calendar: { date, days: [{ date, count: 1 }], scheduledDays: [{ date: tomorrow, count: 1 }] } } };
  const past = { ...today, items: [], paging: { ...today.paging, total: 0, calendar: { ...today.paging.calendar, date: yesterday } } };
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'calendar=today', status: 200, body: today });
    });
    await act(() => { fulfill({ urlPart: '/api/v1/plan/daily', status: 200, body: daily }); });
    const input = calendarControl<HTMLInputElement>('[aria-label="选择日历月份"]');
    expect(input.value).toBe('2026年11月');
    click(button('下月'));
    expect(input.value).toBe('2026年12月');
    expect(calendarCell('2026-12-21').getAttribute('aria-pressed')).toBe('false');
    expect(calendarCell('2026-12-21').textContent).toBe('21');
    expect(textOf('[aria-label="工作台日历"]')).toContain('选择日期后查看该月数量');
    await chooseCalendarMonth(input, '2027-03');
    expect(input.value).toBe('2027年3月');
    expect(calendarCell('2027-03-01').tabIndex).toBe(0);
    const todayResults = '[aria-label="2026-11-21 星期六 待办"]';
    expect(textOf(`${todayResults} h2`)).toBe('2026-11-21 星期六');
    expect(textOf(todayResults)).toContain('同名样品');
    expect(textOf(`${todayResults} [role="status"]`)).toBe('1 项');
    await chooseCalendarMonth(input, '2026-12');
    click(button('上月'));
    expect(input.value).toBe('2026年11月');
    expect(calendarCell(date).getAttribute('aria-pressed')).toBe('true');
    act(() => { calendarCell(date).focus(); });
    act(() => { calendarCell(date).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(document.activeElement).toBe(calendarCell(yesterday));
    expect(textOf('output')).toBe('view=calendar');
    click(calendarCell(yesterday));
    expect(document.activeElement).toBe(calendarCell(yesterday));
    expect(textOf('[aria-label="2026-11-20 星期五 待办"] [role="status"]')).toBe('正在更新待办…');
    expect(textOf('[aria-label="2026-11-20 星期五 待办"]')).not.toContain('同名样品');
    await act(() => { fulfill({ urlPart: 'calendar=2026-11-20', status: 200, body: past }); });
    expect(textOf('#today-chase')).toContain('这天没有待办');
    expect(textOf('[aria-label="2026-11-20 星期五 待办"] [role="status"]')).toBe('0 项');
    click(button('回到业务日'));
    expect(new URLSearchParams(textOf('output')).has('date')).toBe(false);
    await act(() => { fulfill({ urlPart: 'calendar=today', status: 200, body: today }); });
    expect(calendarCell(date).textContent).toContain('1项');
    expect(calendarCell(tomorrow).textContent).toContain('1批');
    click(calendarCell(tomorrow));
    const params = new URLSearchParams(textOf('output'));
    expect(params.get('inbox')).toBe('scheduled');
    expect(params.get('date')).toBe(tomorrow);
    await act(() => { fulfill({ urlPart: 'inbox=scheduled&calendar=2026-11-22', status: 200, body: { ...today, paging: { ...today.paging, calendar: { date: tomorrow, days: [{ date: tomorrow, count: 1 }] } } } }); });
    expect(textOf('[aria-label="2026-11-22 星期日 已约跟进"] [role="status"]')).toBe('1 批');
    expect(calendarCell(date).textContent).toContain('待办 1项');
    expect(calendarCell(tomorrow).textContent).toContain('已约跟进 1批');
    button('回到业务日');
    click(calendarCell(date));
    const returned = new URLSearchParams(textOf('output'));
    expect(returned.get('inbox')).toBe('today');
    expect(returned.has('date')).toBe(false);
    await act(() => { fulfill({ urlPart: 'inbox=today&calendar=today', status: 200, body: today }); });
    expect(textOf('#today-chase')).toContain('同名样品');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

it('直接打开已约跟进后可以查看业务日预约，自动预约返回保留今天的原筛选', async () => {
  const date = localDate('2026-11-21');
  const tomorrow = localDate('2026-11-22');
  const base = pageBody(1);
  for (const isAutomatic of [false, true]) {
    emptyReads();
    installMatchMedia();
    installFetch();
    const query = new URLSearchParams({ view: 'calendar', inbox: 'scheduled', date: tomorrow });
    if (isAutomatic) query.set('calendarReturn', 'work=factory_chase');
    const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?' + query));
    try {
      await act(() => {
        fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
        fulfill({ urlPart: 'inbox=scheduled&calendar=2026-11-22', status: 200, body: { ...base, paging: { ...base.paging, calendar: { date: tomorrow, days: [{ date: tomorrow, count: 1 }] } } } });
      });
      if (isAutomatic) {
        await act(() => {
          fulfill({ urlPart: 'work=factory_chase&scope=mine', status: 200,
            body: { ...base, paging: { ...base.paging, calendar: { date, days: [{ date, count: 4 }] } } } });
        });
        expect(calendarCell(date).textContent).toContain('待办 4项');
        expect(calendarCell(tomorrow).textContent).toContain('已约跟进 1批');
        click(button('回到业务日'));
      } else {
        expect(textOf('#today-chase')).not.toContain('回到业务日');
        click(calendarCell(date));
      }
      const returned = new URLSearchParams(textOf('output'));
      expect(returned.get('inbox')).toBe(isAutomatic ? 'today' : 'scheduled');
      expect(returned.get('date')).toBe(isAutomatic ? null : date);
      expect(returned.get('work')).toBe(isAutomatic ? 'factory_chase' : null);
      expect(returned.has('calendarReturn')).toBe(false);
    } finally {
      act(() => { root.unmount(); });
      resetDom();
      emptyReads();
    }
  }
});

function calendarCell(date: string): HTMLElement {
  return calendarControl(`[data-calendar-date="${date}"]`);
}

async function chooseCalendarMonth(input: HTMLInputElement, month: string) {
  act(() => { input.focus(); });
  click(input);
  await waitFor(() => document.querySelector('[aria-label="Choose a year"]') !== null);
  click(button('Choose a year'));
  click(calendarControl(`td[title="${month.slice(0, 4)}"]`));
  click(calendarControl(`td[title="${month}"]`));
}

function calendarControl<T extends HTMLElement>(selector: string): T {
  const control = document.querySelector<T>(selector);
  if (control === null) throw new Error(`没有日历控件 ${selector}`);
  return control;
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
