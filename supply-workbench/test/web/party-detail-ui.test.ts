// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { AppRoutes } from '../../apps/web/src/app/routes.js';
import { entityId } from '../../packages/domain/src/values/ids.js';
import { act, click, element, fulfill, installFetch, installMatchMedia, memoryRouter, mount, resetDom, textOf, waitFor } from './party-preview-dom.js';
import { partyBody } from './party-preview-fixture.js';

afterEach(resetDom);

it('主体详情直接打开筛选后的跟进台，别名和指标仍可切换', async () => {
  const partyId = 'party-supplier';
  const partyName = '宜侬 & 供应链+包装#1';
  installMatchMedia();
  installFetch();
  const user = { id: entityId('user-1'), name: '采购员', roles: ['buyer'] };
  const view = mount(memoryRouter(element(AppRoutes, { user }), `/parties/${partyId}`));

  try {
    fulfill({ urlPart: `/api/v1/parties/${partyId}`, status: 200, body: partyBody(partyId, partyName) });
    await waitFor(() => textOf('h1') === `主体 ${partyName}`);

    expect(orderLink('查看供应商订单')).toEqual({ lane: 'all', supplierPartyId: partyId });
    expect(orderLink('查看代工厂相关订单')).toEqual({ lane: 'all', factoryPartyId: partyId });

    const tabs = [...document.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(['别名', '指标']);
    const [aliases, kpis] = tabs;
    if (aliases === undefined || kpis === undefined) throw new Error('主体页签没有显示');
    const activePanel = '[role="tabpanel"][aria-hidden="false"]';
    expect(textOf(activePanel)).toBe('宜侬原料');
    click(kpis);
    expect(textOf(activePanel)).toBe('应到 4 · 准时样本 3 · 近一个月 2026-10-01 至 2026-11-01');
    click(aliases);
    expect(textOf(activePanel)).toBe('宜侬原料');
  } finally {
    await act(() => view.unmount());
  }
});

function orderLink(label: string): Record<string, string> {
  const anchor = [...document.querySelectorAll('a')].find((item) => item.textContent === label);
  const href = anchor?.getAttribute('href');
  if (href === undefined || href === null) throw new Error(`没有显示链接 ${label}`);
  const url = new URL(href, 'https://workbench.test');
  expect(url.pathname).toBe('/lines');
  expect(url.hash).toBe('');
  return Object.fromEntries(url.searchParams);
}
