import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Locator, Page, Request, Route } from '../node_modules/.pnpm/node_modules/playwright/index.js';

export async function checkHomeRiskFollowUp({ page, origin, out, material, finished }: {
  readonly page: Page;
  readonly origin: URL;
  readonly out: string;
  readonly material: { readonly id: string; readonly po: string };
  readonly finished: { readonly id: string; readonly batch: { readonly id: string; readonly seq: number }; readonly arrivalDate: string };
}) {
  const widths = [1440, 320];
  let originalIds: string[] = [];
  for (const width of widths) {
    await page.setViewportSize({ width, height: width === 320 ? 667 : 900 });
    await page.goto(new URL('/home', origin).href);
    const shop = page.getByRole('group', { name: '店铺范围' }).getByRole('button', { name: '达肤妍', exact: true });
    await shop.click();
    const register = page.getByRole('region', { name: '事项跟踪明细' });
    await register.getByRole('button', { name: '展开事项搜索', exact: true }).click();
    const search = register.getByRole('textbox', { name: '搜索事项', exact: true });
    await search.fill('测试');
    const sort = register.getByRole('columnheader', { name: /下一到货日/u });
    await sort.click();
    await sort.and(register.locator('[aria-sort="ascending"]')).waitFor();
    const risk = page.getByRole('group', { name: '事项概览' }).getByRole('button', { name: /^交期风险/u });
    await risk.waitFor();
    assert.equal(await risk.getAttribute('aria-haspopup'), 'dialog');
    assert.equal(await risk.getAttribute('aria-expanded'), 'false');
    const reads: string[] = [];
    const watch = (request: Request) => {
      const path = new URL(request.url()).pathname;
      if (/^\/api\/v1\/lines\/[^/]+(?:\/timeline)?$/u.test(path) && !path.endsWith('/summary')) reads.push(path);
    };
    page.on('request', watch);
    const drawer = page.getByRole('dialog', { name: '交期风险', exact: true });
    await risk.press('Enter');
    await drawer.waitFor();
    assert.equal(await risk.getAttribute('aria-expanded'), 'true');
    assert.equal(new URL(page.url()).pathname, '/home');
    await drawer.getByText(/^达肤妍 · \d{4}-\d{2}-\d{2} · \d+ 件$/u).waitFor();
    await drawer.getByText('已逾期', { exact: true }).first().waitFor();
    await drawer.getByText('确认到货晚于需求', { exact: true }).first().waitFor();
    assert.match(await drawer.ariaSnapshot(), /dialog "交期风险"/u);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.keyboard.press('Tab');
    assert.equal(await drawer.evaluate((element) => element.contains(document.activeElement)), true);
    await page.screenshot({ path: join(out, `home-risk-${width}.png`), animations: 'disabled' });
    const sortHint = page.getByText('点击降序', { exact: true });
    assert.equal(await sortHint.isVisible(), false);
    assert.deepEqual(reads, []);
    page.off('request', watch);
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    await risk.and(page.locator(':focus')).waitFor();

    if (width === 1440) {
      await page.mouse.move(0, 0);
      await sort.hover();
      await sortHint.waitFor();
    }
    await risk.press('Enter');
    await drawer.waitFor();
    assert.equal(await sortHint.isVisible(), false);
    const homeUrl = page.url();
    const order = drawer.getByRole('link', { name: new RegExp('^查看订单 ' + material.po, 'u') })
      .and(drawer.locator(`a[href^="/lines/${encodeURIComponent(material.id)}?"]`));
    await order.press('Enter');
    await page.waitForURL((url) => decodeURIComponent(url.pathname) === '/lines/' + material.id && !url.searchParams.has('focusBatch'));
    await page.getByRole('heading', { name: material.po, exact: true }).waitFor();
    const back = page.getByRole('link', { name: '返回首页', exact: true });
    await back.press('Enter');
    await checkOrigin({ page, homeUrl, shop, search, sort, link: order });

    const batch = drawer.getByRole('link', { name: /^查看下一要货批次/u })
      .and(drawer.locator(`a[href^="/lines/${encodeURIComponent(finished.id)}?"]`));
    await batch.press('Enter');
    await page.waitForURL((url) => decodeURIComponent(url.pathname) === '/lines/' + finished.id
      && url.searchParams.get('focusBatch') === finished.batch.id);
    await page.waitForFunction(({ seq, arrivalDate }) => (
      document.activeElement?.matches('li[tabindex="-1"]') === true
        && document.activeElement.textContent?.includes(`${seq} ·`) === true
        && document.activeElement.textContent.includes(arrivalDate)
    ), { seq: finished.batch.seq, arrivalDate: finished.arrivalDate });
    await page.goBack();
    await checkOrigin({ page, homeUrl, shop, search, sort, link: batch });

    const group = drawer.getByRole('link', { name: '查看这组订单', exact: true });
    const address = new URL(await group.getAttribute('href') ?? '', origin);
    assert.equal(address.searchParams.get('store'), 'dafuyan');
    const ids = address.searchParams.getAll('riskLine').sort();
    assert.ok(ids.includes(material.id) && ids.includes(finished.id), '整组需要包含首页物料逾期与成品晚于需求');
    const shownIds = await drawer.getByRole('link', { name: /^查看订单 /u }).evaluateAll((links) => links.flatMap((link) => {
      const href = link.getAttribute('href');
      if (href === null) return [];
      const { pathname } = new URL(href, document.baseURI);
      return [decodeURIComponent(pathname.slice('/lines/'.length))];
    }).sort());
    assert.deepEqual(ids, shownIds);
    if (originalIds.length > 0) assert.deepEqual(ids, originalIds);
    originalIds = ids;
    await group.press('Enter');
    const results = page.getByRole('region', { name: '首页交期风险结果' });
    await results.locator(`tr[data-row-key="${material.id}"]`).getByText('已逾期', { exact: true }).waitFor();
    await results.locator(`tr[data-row-key="${finished.id}"]`).getByText('确认到货晚于需求', { exact: true }).waitFor();
    assert.deepEqual(await results.locator('tr[data-row-key]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-key')).sort()), ids);
    await back.press('Enter');
    await checkOrigin({ page, homeUrl, shop, search, sort, link: group });
    if (width === 1440) {
      await order.press('Enter');
      await page.waitForURL((url) => decodeURIComponent(url.pathname) === '/lines/' + material.id);
      await withRiskHiddenOnReturn(page, material.id, async () => {
        await back.press('Enter');
        const heading = drawer.getByRole('heading', { name: '交期风险', exact: true });
        await checkOrigin({ page, homeUrl, shop, search, sort, link: heading });
        await drawer.getByText('原记录已不在当前交期风险范围内，已保留首页筛选。', { exact: true }).waitFor();
        assert.equal(await order.count(), 0);
      });
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  return { widths, originalIds, openOnHome: true, escapeReturnsToTrigger: true, orderBatchAndGroupReturn: true, missingRiskFocusFallback: true };
}

async function withRiskHiddenOnReturn(page: Page, lineId: string, verify: () => Promise<void>) {
  const homeOrders = (url: URL) => url.pathname === '/api/v1/lines' && url.searchParams.has('stages') && url.searchParams.get('store') === 'all';
  let removed = 0;
  const hideRisk = async (route: Route) => {
    const response = await route.fetch();
    assert.ok(response.ok(), await response.text());
    const current: unknown = await response.json();
    assert.ok(isRecord(current) && Array.isArray(current.items));
    const items = current.items.filter((line: unknown) => !isRecord(line) || line.id !== lineId);
    removed += current.items.length - items.length;
    await route.fulfill({ response, json: { ...current, items } });
  };
  await page.route(homeOrders, hideRisk);
  try {
    await verify();
    assert.equal(removed, 1, '应在首页分页结果中屏蔽所选风险订单一次');
  } finally {
    await page.unroute(homeOrders, hideRisk);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function checkOrigin({ page, homeUrl, shop, search, sort, link }: {
  readonly page: Page;
  readonly homeUrl: string;
  readonly shop: Locator;
  readonly search: Locator;
  readonly sort: Locator;
  readonly link: Locator;
}) {
  await page.waitForURL(homeUrl);
  await link.and(page.locator(':focus')).waitFor();
  assert.equal(await shop.getAttribute('aria-pressed'), 'true');
  assert.equal(await search.inputValue(), '测试');
  assert.equal(await sort.getAttribute('aria-sort'), 'ascending');
}
