// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { localDate, type Role } from '../../packages/domain/src/index.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { CauseFilter, SourceLinks } from '../../apps/web/src/pages/dashboard/cause-filter.js';
import { act, button, calls, click, element, fulfill, installFetch, memoryRouter, mount, resetDom } from './party-preview-dom.js';

let mounted: ReturnType<typeof mount> | undefined;
const asOf = localDate('2026-11-21');
const sourcePath = `/api/v1/dashboard/bottlenecks?from=${asOf}&to=${asOf}`;
const categories = [
  { key: 'missing_owner', label: '缺负责人', count: 605, href: '/master?tab=owner-map' },
  { key: 'missing_date', label: '缺确认日期', count: 602, href: '/lines?stages=awaiting_date' },
];

afterEach(async () => {
  await act(() => mounted?.unmount());
  mounted = undefined;
  resetDom();
});

it('管理角色看到清单与来源各自的数量，并保留有权限的来源链接', async () => {
  const sources = await showSources(['manager']);
  expect(document.querySelector('[aria-label="当前卡点清单"]')?.textContent).toContain('缺负责人 3');
  expect(sources.textContent).toContain('缺负责人 605');
  expect(sources.textContent).toContain('主数据项由审核人或管理员办理');
  expect(sources.querySelector('a[href^="/master"]')).toBeNull();
  expect(sources.querySelector('a[href="/lines?stages=awaiting_date"]')?.textContent).toBe('缺确认日期 602');
});

it('同时拥有审核能力的管理角色可继续进入主数据来源', async () => {
  const sources = await showSources(['manager', 'reviewer']);
  expect(sources.querySelector('a[href="/master?tab=owner-map"]')?.textContent).toBe('缺负责人 605');
  expect(sources.textContent).not.toContain('主数据项由审核人或管理员办理');
});

it('来源请求失败时仍显示卡点原因，重试只读取来源并区分空结果', async () => {
  mountFilter(['manager']);
  const sources = sourceGroup();
  expect(sources.textContent).toContain('正在读取来源汇总');
  expect(sources.getAttribute('aria-busy')).toBe('true');

  await act(() => { fulfill({ urlPart: sourcePath, status: 503, body: { error: { code: 'INTERNAL' } } }); });
  expect(sources.querySelector('[role="alert"]')?.textContent).toContain('来源汇总没有读出来');
  expect(sources.textContent).not.toContain('暂无来源数据');
  expect(document.querySelector('[aria-label="当前卡点清单"]')?.textContent).toContain('缺负责人 3');

  click(button('重试来源汇总'));
  expect(calls.map(({ url }) => url)).toEqual([sourcePath]);
  expect(sources.textContent).toContain('正在读取来源汇总');
  await act(() => { fulfill({ urlPart: sourcePath, status: 200, body: { categories: [] } }); });
  expect(sources.textContent).toContain('暂无来源数据');
  expect(sources.getAttribute('aria-busy')).toBe('false');
});

async function showSources(roles: readonly Role[]): Promise<Element> {
  mountFilter(roles);
  await act(() => { fulfill({ urlPart: sourcePath, status: 200, body: { categories } }); });
  return sourceGroup();
}

function mountFilter(roles: readonly Role[]): void {
  installFetch();
  const counts = { missing_owner: 3, missing_factory: 3, supplier_pending: 0, missing_date: 3, exception_open: 0, aged_15: 0, bom_missing: 0, factory_demand_unlinked: 0 };
  const children = element('div', { children: [
    element(CauseFilter, { key: 'filter', counts, cause: 'missing_owner', onSearch: () => undefined }),
    element(SourceLinks, { key: 'sources', asOf }),
  ] });
  mounted = mount(memoryRouter(element(ActorRoles, { roles, children })));
}

function sourceGroup(): Element {
  const sources = document.querySelector('[aria-label="来源汇总"]');
  if (sources === null) throw new Error('页面没有来源汇总');
  return sources;
}
