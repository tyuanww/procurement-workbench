// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
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
  expect(textOf('body')).not.toContain('截至今日');
  expect(textOf('body')).toContain('开放批次');
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
    { ...shared, batchId: 'batch-1', batchSeq: 1 },
    {
      ...shared, batchId: 'batch-2', batchSeq: 2,
      waitingOn: { kind: 'internal', partyId: null, displayName: null, reason: 'internal_note' },
      fulfillment: {
        unit: '件', unshippedQty: 0, inTransitQty: 1234.5678, receivedQty: 0, verifiedShippedQty: 1234.5678, verifiedReceivedQty: 0,
        overShippedQty: 0, overReceivedQty: 0, receiptWithoutShipmentQty: 0, reviewCount: 0,
      },
    },
  ] });

  expect(button('查看卡点明细 PO-01 第 1 批').textContent).toContain('第 1 批');
  click(button('查看卡点明细 PO-01 第 2 批'));
  const dialog = '[role="dialog"]';
  await waitFor(() => textOf(dialog).includes('第 2 批'));
  expect(textOf(dialog)).toContain('要货批次');
  expect(textOf(dialog)).toContain('内部（等回单）');
  expect(textOf(dialog)).toContain('内部负责人');
  expect(textOf(dialog)).toContain('未发 0 件');
  expect(textOf(dialog)).toContain('在途 1,234.5678 件');
  expect(textOf(dialog)).toContain('实收 0 件');
  const detail = document.querySelector(`${dialog} a`);
  expect(detail?.textContent).toBe('核对本批记录');
  const target = new URL(detail?.getAttribute('href') ?? '', 'https://workbench.test');
  expect(target.pathname).toBe('/lines/line-01');
  expect(target.searchParams.get('focusBatch')).toBe('batch-2');
  expect(Object.fromEntries(new URLSearchParams(target.searchParams.get('backToStuck') ?? ''))).toMatchObject({
    lane: 'finished', stuckBatch: 'batch-2',
  });
  click(button('Close'));
  await waitFor(() => document.querySelector('.ant-drawer-open') === null);
  click(button('查看卡点明细 PO-01 第 1 批'));
  await waitFor(() => textOf(dialog).includes('第 1 批'));
  expect(textOf(dialog)).toContain('数量待核');
  expect(textOf(dialog)).toContain('未发 —');
});

it('旧卡点链接按服务端实际展示的页码返回并保留筛选', async () => {
  installMatchMedia();
  installFetch();
  const address = '/dashboard?view=legacy&lane=finished&card=overdue&page=99';
  page = mount(memoryRouter(element(ActorRoles, { roles: ['manager'], children: element(DashboardPage) }), address));
  const visible = { ...base, total: 151, page: 4, items: [{ ...late, poRaw: 'PO-01', batchSeq: 2, orderLineId: 'line-01' }] };
  await respond('lane=finished&card=overdue&page=99', visible);
  click(button('查看卡点明细 PO-01 第 2 批'));
  await respond('lane=finished&card=overdue&page=4', visible);
  const selector = '[role="dialog"] a';
  await waitFor(() => textOf(selector) === '核对本批记录');
  const detail = new URL(document.querySelector(selector)?.getAttribute('href') ?? '', 'https://workbench.test');
  expect(detail.searchParams.get('backToStuck')).toBe('view=legacy&lane=finished&card=overdue&page=4&stuckBatch=overdue');
  expect(document.querySelector('.ant-pagination-item-active')?.textContent).toBe('4');
});

it('卡点读取失败先显示重试，重试成功后把消失的批次提示放在原清单焦点旁', async () => {
  installMatchMedia();
  installFetch();
  const address = '/dashboard?lane=finished&card=overdue&page=4&stuckBatch=gone';
  page = mount(memoryRouter(element(DashboardPage), address));
  await waitFor(() => calls.some(({ url }) => url.startsWith('/api/v1/dashboard/stuck?')));
  await act(async () => { fulfill({ urlPart: '/api/v1/dashboard/stuck?', status: 503, body: {} }); });
  await waitFor(() => textOf('body').includes('看板没有读出来'));
  expect(textOf('body')).not.toContain('原批次已不在');
  click(button('重试'));
  await respond('lane=finished&card=overdue&page=4', { ...base, page: 4, items: [late] });
  const list = document.querySelector('[aria-label="卡点明细"]');
  const alert = list?.querySelector('[role="alert"]');
  expect(alert?.textContent).toContain('原批次已不在当前卡点清单，原筛选已保留。');
  expect(alert?.compareDocumentPosition(list?.querySelector('table') ?? document.body)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(document.activeElement).toBe(list);
  expect(textOf('body')).toContain('当前筛选 逾期');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  click(button('关闭提示'));
  await waitFor(() => !textOf('body').includes('原批次已不在'));
  expect(document.querySelector('.ant-pagination-item-active')?.textContent).toBe('4');
  expect(textOf('body')).toContain('当前筛选 逾期');
});

it('手机卡点先显示具体批次，旧链接的报表期间不参与当日快照', async () => {
  installMatchMedia();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.startsWith('(max-width'), addEventListener: () => undefined, removeEventListener: () => undefined,
  }));
  installFetch();
  page = mount(memoryRouter(element(DashboardPage), '/dashboard?lane=finished&from=2025-01-01&to=2025-02-01'));
  const request = calls.find(({ url }) => url.startsWith('/api/v1/dashboard/stuck?'));
  const search = new URLSearchParams(request?.url.split('?')[1]);
  expect(search.get('from')).not.toBe('2025-01-01');
  expect(search.get('from')).toBe(search.get('to'));
  await respond('lane=finished', { ...base, total: 1, items: [{ ...older, poRaw: 'PO-01', batchSeq: 3 }] });

  expect(textOf('thead')).toContain('采购单 / 批次');
  expect(button('查看卡点明细 PO-01 第 3 批').textContent).toContain('第 3 批');
  expect(document.querySelector('.ant-collapse [aria-expanded="false"]')?.textContent).toContain('卡点指标与原因筛选');
  expect(document.querySelector('[aria-label="期间"]')).toBeNull();
  expect(calls.some(({ url }) => url === '/api/v1/dashboard/bottlenecks?from=2026-10-12&to=2026-10-12')).toBe(true);
});

async function respond(filter: string, body: StuckDashboard): Promise<void> {
  const urlPart = '/api/v1/dashboard/stuck?';
  await waitFor(() => calls.some((call) => call.url.startsWith(urlPart)));
  expect(calls.find((call) => call.url.startsWith(urlPart))?.url).toMatch(new RegExp(`&${filter}$`));
  await act(async () => { fulfill({ urlPart, status: 200, body }); });
}
