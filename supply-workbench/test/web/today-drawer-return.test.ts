// @vitest-environment happy-dom
import { expect, it } from 'vitest';
import type { TodayPageResponse, TodoItemView } from '../../packages/contracts/src/index.js';
import { localDate } from '../../packages/domain/src/index.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, button, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, useHostSearch, waitFor } from './party-preview-dom.js';
import { antdApp, batchTodo, LocationAndToday, pageBody } from './today-workspace-fixture.js';

it('有批次的异常仍可打开原订单详情并定位该批次', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?drawer=exception%3Aexception-1'));
  const item: TodoItemView = {
    ...batchTodo(1), id: 'exception:exception-1', subject: 'exception', reasons: ['exception_open'],
    refs: { orderLineId: 'line', batchId: 'batch-1', exceptionId: 'exception-1' },
    exception: { id: 'exception-1', type: 'other', note: '合成异常说明' },
  };
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'focusId=exception%3Aexception-1', status: 200, body: { ...pageBody(1), items: [item] } });
    });
    await waitFor(() => textOf('[role="dialog"]').includes('合成异常说明'));
    const link = document.querySelector('[role="dialog"] a[href="/lines/line?focusBatch=batch-1"]');
    expect(link?.textContent).toBe('打开订单详情');
    expect(textOf('[role="dialog"]')).not.toContain('核对本批记录');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

it('在途待收关闭抽屉后焦点回到实际打开的批次', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?view=arrivals&focusBatch=batch-1'));
  const arrivalMemos = [1, 2].map((batchSeq) => {
    const batch = batchTodo(batchSeq);
    if (batch.line === null) throw new Error('缺少在途批次订单');
    return { batchId: 'batch-' + batchSeq, batchSeq, line: batch.line, warehouse: '上海仓',
      confirmedDate: localDate('2026-11-20'), status: 'overdue', inTransitQty: 10, receivedQty: 0, unit: '件',
    } satisfies TodayPageResponse['arrivalMemos'][number];
  });
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'scope=mine', status: 200, body: { ...pageBody(0), arrivalMemos } });
    });
    await waitFor(() => document.activeElement?.id === 'today-arrival:batch-1');
    click(button('查看批次 PO · 同名样品 · 批次 2'));
    await waitFor(() => textOf('[role="dialog"]').includes('核对本批记录'));
    click(button('关闭'));
    await waitFor(() => document.activeElement?.id === 'today-arrival:batch-2');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

it('在途刷新后原批次已不在筛选范围，清除抽屉并说明去向', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?view=arrivals&timing=overdue&drawer=batch%3Abatch-1'));
  const { line } = batchTodo(1);
  if (line === null) throw new Error('缺少在途批次订单');
  const memo: TodayPageResponse['arrivalMemos'][number] = {
    batchId: 'batch-1', batchSeq: 1, line, warehouse: '上海仓', confirmedDate: localDate('2026-11-20'),
    status: 'overdue', inTransitQty: 10, receivedQty: 0, unit: '件',
  };
  try {
    const snapshot = pageBody(0);
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'scope=mine', status: 200, body: { ...snapshot, arrivalMemos: [memo],
        paging: { ...snapshot.paging, followUpCounts: { due: 0, scheduled: 1 } } } });
    });
    await waitFor(() => textOf('[role="dialog"]').includes('核对本批记录'));
    await act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await act(() => { fulfill({ urlPart: 'scope=mine', status: 200, body: snapshot }); });
    await waitFor(() => textOf('output') === 'view=arrivals&timing=overdue');
    await waitFor(() => document.activeElement?.textContent === '该批次已不在当前待收范围。');
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

it('新工作范围尚未读完时，抽屉的本批复制暂停', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const root = mount(memoryRouter(antdApp(element(ChangeInbox)), '/today?drawer=batch%3Abatch-1'));
  const snapshot = pageBody(1);
  const settled = { ...snapshot, items: [batchTodo(1)], paging: { ...snapshot.paging, chaseItemIds: ['batch:batch-1'] } };
  try {
    await act(() => {
      fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
      fulfill({ urlPart: 'inbox=today', status: 200, body: settled });
    });
    await waitFor(() => drawerCopy()?.disabled === false);
    click(button('切换样本范围'));
    await waitFor(() => new URLSearchParams(textOf('output')).get('inbox') === 'scheduled');
    expect(drawerCopy()?.disabled).toBe(true);
    await act(() => { fulfill({ urlPart: 'inbox=scheduled', status: 200, body: { ...settled, paging: snapshot.paging } }); });
    await waitFor(() => drawerCopy() === undefined);
  } finally {
    act(() => { root.unmount(); });
    resetDom();
    emptyReads();
  }
});

function drawerCopy() {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(({ textContent }) => textContent === '复制本批催单');
}

function ChangeInbox() {
  const [search, setSearch] = useHostSearch();
  return element('div', { children: [
    element('button', { key: 'change', onClick: () => {
      const next = new URLSearchParams(search);
      next.set('inbox', 'scheduled');
      setSearch(next);
    }, children: '切换样本范围' }),
    element(LocationAndToday, { key: 'today' }),
  ] });
}
