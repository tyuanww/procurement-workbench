// @vitest-environment happy-dom
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, it } from 'vitest';
import { TodayPage } from '../../apps/web/src/pages/today/TodayPage.js';
import { actionQuery } from '../../apps/web/src/pages/today/action-query.js';
import { handleKey, type KeyActions } from '../../apps/web/src/pages/today/today-keys.js';
import { useTodayData } from '../../apps/web/src/pages/today/today-load.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, button, calls, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, useHostSearch, useHostState, waitFor } from './party-preview-dom.js';

const requireWeb = createRequire(path.join(process.cwd(), 'apps/web/package.json'));

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

function antdApp(children: unknown) {
  const antd: unknown = requireWeb('antd');
  if (typeof antd !== 'object' || antd === null || !('App' in antd)) throw new Error('没有 Ant Design App');
  return element(antd.App, { children });
}

function LocationAndToday() {
  const [search] = useHostSearch();
  return element('div', { children: [
    element('output', { key: 'url', children: search.toString() }),
    element(TodayPage, { key: 'today' }),
  ] });
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

function BoardRead() {
  const [search, setSearch] = useHostState('page=2&reasons=unshipped');
  const board = useTodayData(actionQuery(search));
  return element('div', { children: [
    element('button', { key: 'filter', onClick: () => setSearch('reasons=missing_date'), children: '换筛选' }),
    element('output', { key: 'total', children: board.data?.paging.total }),
  ] });
}

function pageBody(total: number) {
  const counts = {
    overdue: 0, demand_before_confirmed: 0, due_today: 0, missing_date: 0, shipped_not_received: 0, note_missing: 0, upcoming: 0,
    unshipped: 0, fulfillment_review: 0, exception_open: 0, review_pending: 0, import_pending: 0, unassigned: 0,
  };
  return {
    asOf: '2026-11-21', counts, items: [], arrivalMemos: [], truncated: false,
    paging: { page: 1, pageSize: 50, total, reasonCounts: counts, urgent: 0, units: [], factories: [] },
  };
}
