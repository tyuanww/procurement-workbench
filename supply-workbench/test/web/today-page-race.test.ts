// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import type { TodoItemView } from '../../packages/contracts/src/index.js';
import { BatchProgress } from '../../apps/web/src/features/today/batch-progress.js';
import { actionQuery } from '../../apps/web/src/pages/today/action-query.js';
import { handleKey, type KeyActions } from '../../apps/web/src/pages/today/today-keys.js';
import { useTodayData } from '../../apps/web/src/pages/today/today-load.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, button, calls, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, useHostState, waitFor } from './party-preview-dom.js';
import { antdApp, batchTodo, LocationAndToday, pageBody } from './today-workspace-fixture.js';

it('请求顺序颠倒时，较早的行动板页无法覆盖已经显示的新筛选结果', async () => {
  emptyReads();
  installFetch();
  const root = mount(element(BoardRead));
  try {
    fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
    const stale = calls.find((call) => call.url.includes('page=2'));
    if (stale === undefined) throw new Error('没有较早的第 2 页请求');
    click(button('换筛选'));
    expect(stale.signal?.aborted).toBe(true);
    await act(async () => {
      fulfill({ urlPart: 'reasons=missing_date', status: 200, body: pageBody(10) });
    });
    expect(textOf('output')).toBe('10');
    await act(async () => { stale.resolve(Response.json(pageBody(500))); });
    expect(textOf('output')).toBe('10');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

it('分页定位完成后保留旧抽屉地址，当前结果中没有的抽屉才关闭', async () => {
  const target = 'batch:old-link';
  await openOldLink({ target, isPresent: true });
  await openOldLink({ target: 'batch:unavailable', isPresent: false });
});

it('行动板同名批次可用键盘打开指定抽屉，关闭后保留清单', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today'));
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: '/api/v1/today', status: 200, body: { ...pageBody(2), items: [batchTodo(1), batchTodo(2)] } });
    });
    expect(textOf('[aria-label="工作台视图"] .ant-segmented-item-selected')).toBe('列表');
    expect(button('查看详情 PO · 同名样品 · 第 1 批')).toBeDefined();
    expect(button('查看详情 PO · 同名样品 · 第 2 批')).toBeDefined();
    expect(textOf('body')).not.toContain('截至今日');
    expect(textOf('.today-business-date')).toBe('业务日 2026-11-21');
    expect(textOf('body')).not.toContain('用 j k 移动');
    pressTodayKey('?');
    expect(textOf('[role="dialog"]')).toContain('j k 或方向键移动，Enter 打开');
    pressTodayKey('Escape');
    pressTodayKey('j');
    expect(keyboardRow()).toContain('第 1 批');
    expect(document.activeElement?.textContent).toContain('第 1 批');
    pressTodayKey('ArrowDown');
    expect(keyboardRow()).toContain('第 2 批');
    expect(document.activeElement?.textContent).toContain('第 2 批');
    pressTodayKey('k');
    expect(keyboardRow()).toContain('第 1 批');
    pressTodayKey('ArrowDown');
    pressTodayKey('Enter');
    const batchDrawer = '.ant-drawer [role="dialog"]';
    await waitFor(() => textOf(batchDrawer).includes('第 2 批'));
    expect(textOf(batchDrawer)).not.toContain('第 1 批');
    expect(textOf(batchDrawer)).toContain('批次交付数量待核实');
    expect(new URLSearchParams(textOf('output')).get('drawer')).toBe('batch:batch-2');
    pressTodayKey('Escape');
    await waitFor(() => !new URLSearchParams(textOf('output')).has('drawer'));
    expect(button('查看详情 PO · 同名样品 · 第 1 批')).toBeDefined();
    expect(button('查看详情 PO · 同名样品 · 第 2 批')).toBeDefined();
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

function pressTodayKey(key: string): void {
  act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key })); });
}

it('未发与在途数量待核时，详情仍列出已核实的实收数量', () => {
  installMatchMedia();
  const root = mount(element(BatchProgress, { facts: { unit: '件', unshippedQty: null, inTransitQty: null, receivedQty: 4000 } }));
  try {
    const numbers = textOf('[aria-label="批次交付数量"]');
    expect(numbers).toContain('未发待核实');
    expect(numbers).toContain('在途待收待核实');
    expect(numbers).toContain('实收4,000 件');
    expect(document.querySelector('canvas')).toBeNull();
  } finally {
    act(() => { root.unmount(); });
    resetDom();
  }
});

function keyboardRow(): string | null {
  const row = [...document.querySelectorAll<HTMLElement>('.today-row')].find((item) => item.style.outlineStyle === 'solid');
  return row?.querySelector('button[aria-label^="查看详情"]')?.getAttribute('aria-label') ?? null;
}

it('要催货与内部等回单各显示对应批次并保留回到全部待办的入口', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today'));
  const pending = batchTodo(3);
  if (pending.batch === null) throw new Error('缺少回单样例批次');
  const internal: TodoItemView = { ...pending, reasons: ['note_missing'], waitingOn: { kind: 'internal', partyId: null }, batch: { ...pending.batch, status: 'shipped' } };
  const factories = [batchTodo(1), batchTodo(2)];
  const result = (items: readonly TodoItemView[]) => {
    const base = pageBody(items.length);
    return { ...base, items, paging: { ...base.paging, chaseCounts: { all: 2, filtered: items.filter((item) => item.waitingOn.kind === 'supplier').length }, internalNoteCount: 1 } };
  };
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: '/api/v1/today', status: 200, body: result([...factories, internal]) });
    });
    expect(document.querySelectorAll('.today-row')).toHaveLength(3);
    const filter = button('筛选');
    click(filter);
    click(button('要催货2批'));
    await act(() => { fulfill({ urlPart: 'work=factory_chase', status: 200, body: result(factories) }); });
    expect(document.querySelectorAll('.today-row')).toHaveLength(2);
    expect(textOf('#today-chase')).toContain('共 2 批待催货');
    expect(textOf('#today-chase')).toContain('当前筛选 · 要催货');
    expect(document.activeElement?.id).toBe('today-chase');

    click(button('内部等回单1批'));
    await act(() => { fulfill({ urlPart: 'work=internal_note', status: 200, body: result([internal]) }); });
    expect(textOf('.today-row')).toContain('等待方 · 内部（等回单）');
    expect(textOf('#today-chase')).toContain('共 1 批等回单');
    expect(textOf('#today-chase')).toContain('当前筛选 · 内部等回单');
    click(filter);
    click(button('清除筛选'));
    await act(() => { fulfill({ urlPart: '/api/v1/today', status: 200, body: result([...factories, internal]) }); });
    expect(document.querySelectorAll('.today-row')).toHaveLength(3);
    expect(new URLSearchParams(textOf('output')).get('work')).toBeNull();
    expect(document.activeElement?.getAttribute('aria-expanded')).toBe('false');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

async function openOldLink({ target, isPresent }: { readonly target: string; readonly isPresent: boolean }) {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), `/today?reasons=missing_date&drawer=${encodeURIComponent(target)}`));
  try {
    fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
    expect(new URLSearchParams(textOf('output')).get('drawer')).toBe(target);
    await act(async () => {
      fulfill({ urlPart: `focusId=${encodeURIComponent(target)}`, status: 200, body: locatedPage({ target, isPresent }) });
    });
    if (isPresent) {
      await waitFor(() => new URLSearchParams(textOf('output')).get('page') === '2');
      expect(new URLSearchParams(textOf('output')).get('drawer')).toBe(target);
      await act(async () => {
        fulfill({ urlPart: 'page=2&', status: 200, body: locatedPage({ target, isPresent }) });
      });
      await waitFor(() => document.querySelector('[role="dialog"]')?.textContent?.includes('旧地址样品') === true);
    } else {
      await waitFor(() => new URLSearchParams(textOf('output')).get('drawer') === null);
    }
    expect(new URLSearchParams(textOf('output')).get('reasons')).toBe('missing_date');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
}

function locatedPage({ target, isPresent }: { readonly target: string; readonly isPresent: boolean }) {
  const base = pageBody(isPresent ? 51 : 0);
  if (!isPresent) return base;
  return {
    ...base,
    paging: { ...base.paging, page: 2 },
    items: [{
      id: target, subject: 'batch', reasons: ['missing_date'], severity: 1, ownerUserId: 'buyer-1',
      waitingOn: { kind: 'supplier', partyId: null }, dueDate: null, overdueDays: null, refs: {},
      line: { id: 'line', lane: 'finished', poRaw: 'PO', poFormat: 'OTHER', nameRaw: '旧地址样品', itemCodeRaw: null, barcodeRaw: null, buyerName: null },
      batch: null, waitingOnParty: null, exception: null,
    }],
  };
}

it('排期行获得焦点时仍能用 j 移动，行内按钮保留自己的键盘事件', () => {
  const row = document.createElement('div');
  row.className = 'today-task-row';
  row.id = 'today-row-task:a';
  row.setAttribute('role', 'button');
  row.tabIndex = 0;
  const child = document.createElement('button');
  row.append(child);
  const focused: (string | null)[] = [];
  const actions: KeyActions = {
    setFocus: (id) => { focused.push(id); },
    openDrawer: () => undefined, open: () => undefined, toggleHelp: () => undefined, closeDraft: () => undefined, closeDrawer: () => undefined,
  };
  for (const target of [row, child]) {
    handleKey({
      event: { key: 'j', target, defaultPrevented: false, preventDefault: () => undefined },
      rows: [{ id: 'task:a' }, { id: 'task:b' }], focus: 'task:a', hasDraft: false, isPlanMode: true, actions,
    });
  }
  expect(focused).toEqual(['task:b']);
});

it('在表单中按 Esc 回到详情，组合框展开时先交给组合框处理', () => {
  const field = document.createElement('input');
  const actionsTaken: string[] = [];
  const actions: KeyActions = {
    closeDraft: () => { actionsTaken.push('draft'); },
    closeDrawer: () => { actionsTaken.push('drawer'); },
    openDrawer: () => { actionsTaken.push('open'); },
    open: () => { actionsTaken.push('write'); },
    setFocus: () => { actionsTaken.push('move'); },
    toggleHelp: () => { actionsTaken.push('help'); },
  };
  const handle = (key: string) => handleKey({
    event: { key, target: field, defaultPrevented: false, preventDefault: () => undefined },
    rows: [{ id: 'batch:a' }], focus: 'batch:a', hasDraft: true, hasDrawer: true, actions,
  });
  handle('j');
  handle('n');
  handle('Enter');
  expect(actionsTaken).toEqual([]);
  field.setAttribute('role', 'combobox');
  field.setAttribute('aria-expanded', 'true');
  handle('Escape');
  expect(actionsTaken).toEqual([]);
  field.setAttribute('aria-expanded', 'false');
  handle('Escape');
  expect(actionsTaken).toEqual(['draft']);
});

function BoardRead() {
  const [search, setSearch] = useHostState('page=2&reasons=unshipped');
  const board = useTodayData(actionQuery(search));
  return element('div', { children: [
    element('button', { key: 'filter', onClick: () => setSearch('reasons=missing_date'), children: '换筛选' }),
    element('output', { key: 'total', children: board.data?.paging.total }),
  ] });
}
