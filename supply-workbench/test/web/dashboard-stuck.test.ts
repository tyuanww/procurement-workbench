// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import type { StuckDashboard } from '../../packages/contracts/src/index.js';
import { localDate } from '../../packages/domain/src/index.js';
import { DashboardPage } from '../../apps/web/src/pages/dashboard/DashboardPage.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { act, button, calls, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, waitFor } from './party-preview-dom.js';
import { stuckItem } from './w07-rows.js';

const older = stuckItem({ batchId: 'older', stage: 'confirmed', daysInStage: 41, nameRaw: '旧批次' });
const pending = stuckItem({ batchId: 'latest-pending', stage: 'awaiting_date', daysInStage: 0, nameRaw: '待确认的最新批次' });
const late = { ...older, batchId: 'overdue', nameRaw: '逾期批次', dateBuyerConfirmed: localDate('2026-10-01') };
const base: StuckDashboard = {
  asOf: localDate('2026-10-12'),
  kpis: { openBatches: 201, overdue: 1, awaitingDate: 1, shippedNotReceived: 0 },
  distribution: [],
  causeCounts: { missing_owner: 201, missing_factory: 201, supplier_pending: 0, missing_date: 1, exception_open: 0, aged_15: 200, bom_missing: 0, factory_demand_unlinked: 0 },
  total: 201,
  page: 1,
  pageSize: 50,
  items: [older],
};
let page: ReturnType<typeof mount> | undefined;
afterEach(async () => {
  await act(() => page?.unmount());
  page = undefined;
  resetDom();
});

it('卡点翻页和卡片下钻沿用所选线别并显示服务端匹配清单', async () => {
  installMatchMedia();
  installFetch();
  page = mount(memoryRouter(element(DashboardPage), '/dashboard?lane=finished'));
  await respond('lane=finished', base);
  expect(textOf('body')).toContain('截至今日（2026-10-12）');
  expect(textOf('tbody')).toContain('旧批次');
  expect(textOf('body')).toContain('卡点清单（201 批）');

  const lastPage = document.querySelector<HTMLElement>('.ant-pagination-item-5');
  if (lastPage === null) throw new Error('缺少第 5 页');
  click(lastPage);
  await respond('lane=finished&page=5', { ...base, page: 5, items: [pending] });
  expect(textOf('tbody')).toContain('待确认的最新批次');

  click(button('逾期1'));
  await respond('lane=finished&card=overdue', { ...base, total: 1, items: [late] });
  expect(button('逾期1').getAttribute('aria-pressed')).toBe('true');
  expect(textOf('tbody')).toContain('逾期批次');

  click(button('待确认日期1'));
  await respond('lane=finished&stage=awaiting_date', { ...base, total: 1, items: [pending] });
  expect(textOf('tbody')).toContain('待确认的最新批次');
  expect(calls.every((call) => call.url.startsWith('/api/v1/dashboard/bottlenecks?'))).toBe(true);
});

it('同单同品同日的要货批次按序号区分，抽屉链接定位所选批次', async () => {
  installMatchMedia();
  installFetch();
  page = mount(memoryRouter(element(ActorRoles, { roles: ['manager'], children: element(DashboardPage) }), '/dashboard?lane=finished'));
  const shared = { ...older, poRaw: 'PO-01', nameRaw: '面膜', orderLineId: 'line-01', dateBuyerConfirmed: localDate('2026-10-20') };
  await respond('lane=finished', { ...base, total: 2, items: [
    { ...shared, batchId: 'batch-1', batchSeq: 1 }, { ...shared, batchId: 'batch-2', batchSeq: 2 },
  ] });

  expect(button('查看卡点明细 PO-01 第 1 批').textContent).toContain('第 1 批');
  click(button('查看卡点明细 PO-01 第 2 批'));
  const dialog = '[role="dialog"]';
  await waitFor(() => textOf(dialog).includes('第 2 批'));
  expect(textOf(dialog)).toContain('要货批次');
  const detail = document.querySelector(`${dialog} a`);
  expect(detail?.textContent).toBe('打开订单行');
  expect(detail?.getAttribute('href')).toBe('/lines/line-01?focusBatch=batch-2');
});

async function respond(filter: string, body: StuckDashboard): Promise<void> {
  const urlPart = '/api/v1/dashboard/stuck?';
  await waitFor(() => calls.some((call) => call.url.startsWith(urlPart)));
  expect(calls.find((call) => call.url.startsWith(urlPart))?.url).toMatch(new RegExp(`&${filter}$`));
  await act(async () => { fulfill({ urlPart, status: 200, body }); });
}
