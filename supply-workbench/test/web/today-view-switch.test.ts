// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import type { TodoItemView } from '../../packages/contracts/src/index.js';
import { localDate } from '../../packages/domain/src/index.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, calls, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf } from './party-preview-dom.js';
import { antdApp, batchTodo, LocationAndToday, pageBody } from './today-workspace-fixture.js';

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
