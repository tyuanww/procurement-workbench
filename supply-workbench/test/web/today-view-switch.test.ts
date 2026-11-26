// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import type { TodoItemView } from '../../packages/contracts/src/index.js';
import { localDate } from '../../packages/domain/src/index.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, button, calls, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, waitFor } from './party-preview-dom.js';
import { antdApp, batchTodo, LocationAndToday, pageBody } from './today-workspace-fixture.js';

it('今日事项的一级标签用键盘切换，面板对应选中标签，回到行动板时恢复原筛选', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?view=board&reasons=overdue'));
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'reasons=overdue', status: 200, body: { ...pageBody(1), items: [batchTodo(1)] } });
    });
    const [actions, schedule] = document.querySelectorAll<HTMLElement>('[role="tablist"][aria-label="今日事项视图"] [role="tab"]');
    if (actions === undefined || schedule === undefined) throw new Error('没有今日事项的两个一级标签');
    expect(actions.textContent).toContain('行动板');
    expect(schedule.textContent).toContain('今日排期');
    expect(actions.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[role="tabpanel"][aria-hidden="false"]')?.getAttribute('aria-labelledby')).toBe(actions.id);
    expect(document.querySelector('[role="tabpanel"][aria-hidden="false"] #today-chase')).not.toBeNull();
    act(() => { actions.focus(); });
    act(() => { actions.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true })); });
    expect(document.activeElement).toBe(schedule);
    expect(actions.getAttribute('aria-selected')).toBe('true');
    act(() => { schedule.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true })); });
    const params = new URLSearchParams(textOf('output'));
    expect(params.get('group')).toBe('schedule');
    expect(params.get('workspaceReturn')).toBe('view=board&reasons=overdue');
    expect(schedule.getAttribute('aria-selected')).toBe('true');
    expect(document.querySelector('[role="tabpanel"][aria-hidden="false"]')?.getAttribute('aria-labelledby')).toBe(schedule.id);
    expect(document.querySelector('#today-chase')).toBeNull();
    click(actions);
    expect(textOf('output')).toBe('view=board&reasons=overdue');
    expect(actions.getAttribute('aria-selected')).toBe('true');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

it('点卡片选中对应批次，j 和 k 在当前面板切换，Enter 与标题打开各自的详情', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today'));
  const current = () => textOf('.today-work-card[data-current="true"]');
  const press = (key: string) => act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  });
  const opened = () => new URLSearchParams(textOf('output')).get('drawer');
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: '/api/v1/today', status: 200, body: { ...pageBody(2), items: [batchTodo(1), batchTodo(2)] } });
    });
    expect(document.querySelector('.today-work-card[data-current="true"]')).toBeNull();
    const second = document.getElementById('today-row-batch:batch-2');
    const secondFacts = second?.querySelector<HTMLElement>('.today-row-facts');
    if (secondFacts === undefined || secondFacts === null) throw new Error('没有第 2 批事实');
    click(secondFacts);
    expect(current()).toContain('第 2 批');
    expect(opened()).toBeNull();
    expect(document.activeElement).toBe(second);
    press('j');
    expect(current()).toContain('第 1 批');
    expect(document.activeElement?.id).toBe('today-row-batch:batch-1');
    press('k');
    expect(current()).toContain('第 2 批');
    expect(document.activeElement).toBe(second);
    press('Enter');
    await waitFor(() => opened() === 'batch:batch-2');
    expect(textOf('[role="dialog"]')).toContain('第 2 批');
    press('Escape');
    await waitFor(() => opened() === null);
    click(button('查看详情 PO · 同名样品 · 第 1 批'));
    await waitFor(() => opened() === 'batch:batch-1');
    expect(textOf('[role="dialog"]')).toContain('第 1 批');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

it('原位切换列表与看板，进出日历保留清单分页、筛选和键盘焦点', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?page=2&group=reason&reasons=unshipped&sort=bulk&unit=%E4%BB%B6&focusId=batch%3Abatch-51'));
  const base = pageBody(51);
  const items = [{ ...batchTodo(51), reasons: ['unshipped'] }] satisfies TodoItemView[];
  const list = { ...base, items, paging: { ...base.paging, page: 2 } };
  const date = localDate('2026-11-21');
  const params = () => new URLSearchParams(textOf('output'));
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'page=2', status: 200, body: list });
    });
    const chooseView = (view: '列表' | '看板' | '日历') => {
      const label = [...document.querySelectorAll('.today-workspace-views label')].find((option) => option.textContent?.trim() === view);
      const control = label?.querySelector('input');
      if (control === undefined || control === null) throw new Error(`没有视图 ${view}`);
      control.focus();
      click(control);
      expect(document.activeElement).toBe(control);
      return control;
    };
    chooseView('看板');
    expect(params().get('view')).toBe('board');
    expect(params().get('page')).toBe('2');
    expect(params().get('unit')).toBe('件');
    expect(calls.some((call) => call.url.includes('/api/v1/today'))).toBe(false);
    expect(textOf('[aria-label="跟进供应商"]')).toContain('第 51 批');

    chooseView('日历');
    expect(params().get('page')).toBeNull();
    expect(params().get('focusId')).toBeNull();
    await act(() => { fulfill({ urlPart: 'calendar=today', status: 200, body: { ...base, paging: { ...base.paging, calendar: { date, days: [] } } } }); });
    expect(document.querySelector('[aria-label="工作台日历"]')).not.toBeNull();
    expect(document.querySelector('[aria-label="行动摘要"]')).not.toBeNull();

    const listControl = chooseView('列表');
    expect(params().get('page')).toBe('2');
    expect(params().get('focusId')).toBe('batch:batch-51');
    expect(params().get('group')).toBe('reason');
    expect(params().get('reasons')).toBe('unshipped');
    await act(() => { fulfill({ urlPart: 'page=2', status: 200, body: list }); });
    expect(document.activeElement).toBe(listControl);
    expect(textOf('#today-chase')).toContain('第 51 批');
    expect(document.querySelector('[aria-label="工作台日历"]')).toBeNull();
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});
