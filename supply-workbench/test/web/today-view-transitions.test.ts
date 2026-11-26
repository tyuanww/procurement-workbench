// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, button, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, waitFor } from './party-preview-dom.js';
import { antdApp, batchTodo, LocationAndToday, pageBody } from './today-workspace-fixture.js';

it('切换优先和工作台视图时，保留结果框及可见旧批次，直到新查询就绪', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today'));
  const all = { ...pageBody(2), items: [batchTodo(1), batchTodo(2)] };
  const priority = { ...pageBody(1), items: [{ ...batchTodo(1), reasons: ['overdue'] }] };
  const panel = () => document.querySelector('.today-action-main');
  const rows = () => panel()?.querySelectorAll('.today-batch-card');
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: '/api/v1/today', status: 200, body: all });
    });
    const frame = panel();
    expect(rows()).toHaveLength(2);
    selectView('[aria-label="批次优先范围"] label:nth-of-type(2) input');
    expect(rows()).toHaveLength(2);
    expect(panel()?.querySelector('[aria-busy="true"][inert]')).not.toBeNull();
    await act(() => { fulfill({ urlPart: 'reasons=', status: 200, body: priority }); });
    expect(rows()).toHaveLength(1);
    expect(panel()?.querySelector('[aria-busy="false"][inert]')).toBeNull();
    selectView('[aria-label="工作台视图"] label:nth-of-type(2) input');
    expect(panel()).toBe(frame);
    expect(panel()?.querySelector('.today-kanban')).not.toBeNull();
    selectView('[aria-label="工作台视图"] label:nth-of-type(3) input');
    expect(panel()).toBe(frame);
    expect(rows()).toHaveLength(1);
    expect(panel()?.querySelector('[aria-busy="true"][inert]')).not.toBeNull();
    expect(frame?.textContent).toContain('正在更新待办');
    await act(() => { fulfill({ urlPart: 'calendar=today', status: 200, body: priority }); });
    expect(panel()).toBe(frame);
    expect(panel()?.querySelector('[aria-label="工作台日历"]')).not.toBeNull();
    expect(rows()).toHaveLength(1);
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

it('换页期间保留分页焦点并拒绝重复换页，加载后恢复分页操作', async () => {
  const response = { ...pageBody(126), items: [batchTodo(1)] };
  await withWorkspace(response, async () => {
    const nav = document.querySelector('nav[aria-label="工作台待办分页"]');
    const next = nav?.querySelector('[title="2"]');
    const third = nav?.querySelector('[title="3"]');
    if (!(next instanceof HTMLElement) || !(third instanceof HTMLElement)) throw new Error('未找到分页控件');
    act(() => { next.focus(); });
    act(() => { next.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(new URLSearchParams(textOf('output')).get('page')).toBe('2');
    expect(nav?.getAttribute('aria-disabled')).toBe('true');
    expect(nav?.closest('[inert]')).toBeNull();
    expect(document.activeElement).toBe(next);
    click(third);
    expect(new URLSearchParams(textOf('output')).get('page')).toBe('2');
    await act(() => {
      fulfill({ urlPart: 'page=2', status: 200, body: { ...response, paging: { ...response.paging, page: 2 } } });
    });
    expect(document.activeElement).toBe(next);
    expect(nav?.hasAttribute('aria-disabled')).toBe(false);
    click(third);
    expect(new URLSearchParams(textOf('output')).get('page')).toBe('3');
  });
});

it('页面重新可见触发刷新时关闭已打开的批次菜单，更新结束后可重新打开', async () => {
  const base = pageBody(1);
  const response = { ...base, items: [batchTodo(1)], paging: { ...base.paging, followUpCounts: { due: 0, scheduled: 1 } } };
  await withWorkspace(response, async () => {
    const more = button('更多操作 PO · 同名样品 · 第 1 批');
    click(more);
    await waitFor(() => more.getAttribute('aria-expanded') === 'true');
    const menuId = more.getAttribute('aria-controls');
    if (menuId === null) throw new Error('未找到批次菜单');
    const command = document.getElementById(menuId)?.querySelector<HTMLElement>('[role="menuitem"]');
    if (command === undefined || command === null) throw new Error('未找到批次菜单操作');
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(document.querySelector('.today-action-rows[aria-busy="true"][inert]')).not.toBeNull();
    expect(more.getAttribute('aria-expanded')).toBe('false');
    const closingMenu = document.getElementById(menuId);
    expect(closingMenu === null || closingMenu.hasAttribute('inert')).toBe(true);
    click(command);
    expect(document.querySelector('.today-action-drawer form')).toBeNull();
    await act(() => { fulfill({ urlPart: '/api/v1/today', status: 200, body: response }); });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
  });
});

async function withWorkspace(body: unknown, run: () => Promise<void>): Promise<void> {
  emptyReads();
  installMatchMedia();
  installFetch();
  const tree = element(ActorRoles, { roles: ['buyer'], children: element(LocationAndToday) });
  const root = mount(memoryRouter(antdApp(tree), '/today'));
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: '/api/v1/today', status: 200, body });
    });
    await run();
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
}

function selectView(selector: string): void {
  const input = document.querySelector(selector);
  if (!(input instanceof HTMLInputElement)) throw new Error(`没有找到切换控件 ${selector}`);
  click(input);
}
