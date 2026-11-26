// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import type { TodayChaseRow } from '../../packages/contracts/src/index.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { act, button, calls, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, waitFor } from './party-preview-dom.js';
import { antdApp, batchTodo, LocationAndToday, pageBody } from './today-workspace-fixture.js';

const factory = { id: 'factory-1', name: '合成甲厂' };
const row: TodayChaseRow = {
  id: 'batch:batch-1', factory, poRaw: 'COPY-001', nameRaw: '合成样品', reasons: ['missing_date'],
  dueDate: null, overdueDays: null, unshippedQty: 10, unit: '件',
};

async function loadFactory() {
  const fixture = pageBody(1);
  await act(() => {
    fulfill({ urlPart: '/api/v1/me', status: 200, body: { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true } });
    fulfill({ urlPart: '/api/v1/today', status: 200, body: { ...fixture, items: [{
      ...batchTodo(1),
      waitingOn: { kind: 'supplier', partyId: factory.id },
      waitingOnParty: { id: factory.id, displayName: factory.name, rawName: null },
    }], paging: { ...fixture.paging, factories: [{ ...factory, count: 1 }], chaseCounts: { all: 1, filtered: 1 } } } });
  });
}

it('内部催货汇总在确认前不复制，复制失败仍可重试同一范围', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  let finishCopy: () => void = () => { throw new Error('剪贴板写入未发起'); };
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText')
    .mockRejectedValueOnce(new Error('剪贴板权限不足'))
    .mockImplementationOnce(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today'));
  try {
    await loadFactory();
    click(button('按工厂复制'));
    click(button('预览内部汇总（1批）'));
    await act(() => { fulfill({ urlPart: '/api/v1/today/chase?inbox=today', status: 200, body: [row] }); });
    expect(textOf('[role="dialog"]')).toContain('今日可催 · 1 家工厂 · 1 批');
    expect(clipboard).not.toHaveBeenCalled();

    const confirm = button('复制内部汇总');
    click(confirm);
    await waitFor(() => textOf('[role="dialog"]').includes('复制催单失败，请重试。'));
    expect(textOf('[role="dialog"]')).toContain('今日可催 · 1 家工厂 · 1 批');
    click(confirm);
    click(button('关闭内部催货汇总预览'));
    await act(() => { finishCopy(); });
    await waitFor(() => document.body.textContent?.includes('已复制 1 条催单') === true);
    expect(clipboard).toHaveBeenCalledTimes(2);
    expect(clipboard.mock.calls[1]?.[0]).toBe(clipboard.mock.calls[0]?.[0]);
    expect(clipboard.mock.calls[1]?.[0]).toContain('【内部催货汇总 · 1 家工厂】');
    expect(clipboard.mock.calls[1]?.[0]).toContain('COPY-001');
  } finally {
    act(() => { root.unmount(); });
    clipboard.mockRestore();
    resetDom();
    emptyReads();
  }
});

it('开关工厂弹窗保留正在执行的组头复制，关闭时可退出未完成的内部汇总预览', async () => {
  emptyReads();
  installMatchMedia();
  installFetch();
  const clipboard = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
  const root = mount(memoryRouter(antdApp(element(LocationAndToday)), '/today?group=waiting'));
  try {
    await loadFactory();
    click(button('复制合成甲厂催单（全部页）'));
    click(button('按工厂复制'));
    click(button('关闭'));
    expect(clipboard).not.toHaveBeenCalled();
    await act(() => { fulfill({ urlPart: 'factoryId=factory-1', status: 200, body: [row] }); });
    await waitFor(() => document.body.textContent?.includes('已复制 1 条催单') === true);
    expect(clipboard).toHaveBeenCalledTimes(1);
    expect(clipboard.mock.calls[0]?.[0]).toContain('COPY-001');
    expect(clipboard.mock.calls[0]?.[0]).not.toContain('内部催货汇总');

    click(button('按工厂复制'));
    click(button('预览内部汇总（1批）'));
    const pending = calls.find((call) => call.url.endsWith('/today/chase?inbox=today'));
    if (pending === undefined) throw new Error('汇总预览请求未发起');
    click(button('关闭'));
    expect(pending.signal?.aborted).toBe(true);
    await act(() => { pending.resolve(Response.json([row])); });
    click(button('按工厂复制'));
    expect(textOf('[role="dialog"]')).toContain('按工厂复制');
    expect(clipboard).toHaveBeenCalledTimes(1);
  } finally {
    act(() => { root.unmount(); });
    clipboard.mockRestore();
    resetDom();
    emptyReads();
  }
});
