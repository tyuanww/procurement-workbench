// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import type { Role } from '../../packages/domain/src/index.js';
import { ActorRoles } from '../../apps/web/src/shared/actor.js';
import { CauseFilter } from '../../apps/web/src/pages/dashboard/cause-filter.js';
import { act, element, fulfill, installFetch, memoryRouter, mount, resetDom, waitFor } from './party-preview-dom.js';

let mounted: ReturnType<typeof mount> | undefined;

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

async function showSources(roles: readonly Role[]): Promise<Element> {
  installFetch();
  const counts = { missing_owner: 3, missing_factory: 3, supplier_pending: 0, missing_date: 3, exception_open: 0, aged_15: 0, bom_missing: 0, factory_demand_unlinked: 0 };
  const filter = element(CauseFilter, { counts, from: '2026-11-01', to: '2026-11-21', cause: null, onSearch: () => undefined });
  mounted = mount(memoryRouter(element(ActorRoles, { roles, children: filter })));
  fulfill({ urlPart: '/api/v1/dashboard/bottlenecks', status: 200, body: { categories: [
    { key: 'missing_owner', label: '缺负责人', count: 605, href: '/master?tab=owner-map' },
    { key: 'missing_date', label: '缺确认日期', count: 602, href: '/lines?stages=awaiting_date' },
  ] } });
  const selector = '[aria-label="来源汇总"]';
  await waitFor(() => document.querySelector(selector) !== null);
  const sources = document.querySelector(selector);
  if (sources === null) throw new Error('页面没有来源汇总');
  return sources;
}
