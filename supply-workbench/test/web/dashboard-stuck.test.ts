// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import type { StuckDashboard } from '../../packages/contracts/src/index.js';
import { localDate } from '../../packages/domain/src/index.js';
import { DashboardPage } from '../../apps/web/src/pages/dashboard/DashboardPage.js';
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

async function respond(filter: string, body: StuckDashboard): Promise<void> {
  const urlPart = '/api/v1/dashboard/stuck?';
  await waitFor(() => calls.some((call) => call.url.startsWith(urlPart)));
  expect(calls.find((call) => call.url.startsWith(urlPart))?.url).toMatch(new RegExp(`&${filter}$`));
  await act(async () => { fulfill({ urlPart, status: 200, body }); });
}
