// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom } from './party-preview-dom.js';
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

function selectView(selector: string): void {
  const input = document.querySelector(selector);
  if (!(input instanceof HTMLInputElement)) throw new Error(`没有找到切换控件 ${selector}`);
  click(input);
}
