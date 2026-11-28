import assert from 'node:assert/strict';
import type { Locator, Page, Request } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { seedDemoFixture } from './procurement-today-acceptance.ts';

const drawerName = '交期风险';
const sampleId = 'procurement-component:synthetic-follow-up-large-risk-material:';
const resultsOf = (page: Page) => page.getByRole('region', { name: '首页交期风险结果', exact: true });

export async function checkLargeHomeRiskGroup({ page, origin }: { readonly page: Page; readonly origin: URL }) {
  seedDemoFixture(new URL('../fixtures/demo/follow-up-large-risk-group.sql', import.meta.url));
  const home = new URL('/home?store=dafuyan&q=%E5%90%88%E6%88%90', origin);
  await page.goto(home.href);
  await page.getByRole('group', { name: '事项概览' }).getByRole('button', { name: /^交期风险/u }).press('Enter');
  const drawer = page.getByRole('dialog', { name: drawerName, exact: true });
  const group = drawer.getByRole('link', { name: '查看这组订单', exact: true });
  await group.waitFor();
  const members = await drawer.getByRole('link', { name: /^查看订单 /u }).evaluateAll((links) => links.map((link) => {
    const href = new URL(link.getAttribute('href') ?? '', document.baseURI);
    return decodeURIComponent(href.pathname.slice('/lines/'.length));
  }));
  assert.equal(members.filter((id) => id.startsWith(sampleId)).length, 300);
  const address = new URL(await group.getAttribute('href') ?? '', origin);
  assert.equal(address.searchParams.get('store'), 'dafuyan');
  assert.ok(address.search.length < 2000 && address.hash.length > 16_384);
  assert.equal((await page.request.get(new URL(address.pathname + address.search, origin).href)).status(), 200);
  const homeAddress = page.url();
  await group.press('Enter');
  await resultsOf(page).getByText(`${members.length} 条订单行`, { exact: true }).waitFor();
  await page.getByRole('link', { name: '返回首页', exact: true }).press('Enter');
  await page.waitForURL(homeAddress);
  await group.and(page.locator(':focus')).waitFor();
  await checkCopiedRiskAddress({ page, address, members });
  return { orders: members.length, syntheticOrders: 300, originalStore: 'dafuyan', copiedAddress: true,
    feishuCallback: 'simulated', groupAndDetailReturn: true };
}

async function checkCopiedRiskAddress({ page, address, members }: { readonly page: Page; readonly address: URL; readonly members: readonly string[] }) {
  const browser = page.context().browser();
  assert.ok(browser);
  const context = await browser.newContext({ viewport: { width: 320, height: 667 } });
  try {
    const target = await context.newPage();
    target.setDefaultTimeout(20_000);
    const reads: URL[] = [];
    const track = (request: Request) => {
      const url = new URL(request.url());
      if (url.pathname === '/api/v1/lines' && url.searchParams.has('lineIds')) reads.push(url);
    };
    target.on('request', track);
    const sharedAddress = new URL(address);
    sharedAddress.pathname += '/';
    await signInFromCopiedAddress(target, sharedAddress);
    const results = resultsOf(target);
    await results.getByText(`${members.length} 条订单行`, { exact: true }).waitFor();
    target.off('request', track);
    assert.deepEqual(reads.flatMap((url) => url.searchParams.getAll('lineIds')).sort(), [...members].sort());
    assert.ok(reads.every((url) => url.searchParams.get('store') === 'dafuyan' && url.searchParams.getAll('lineIds').length <= 100));
    assert.ok(reads.every((url) => url.search.length <= 8001));
    await target.goto(address.href);
    await results.getByText(`${members.length} 条订单行`, { exact: true }).waitFor();
    await checkCopiedRiskDetail(target, results);
    const wrongStore = new URL(address);
    wrongStore.searchParams.set('store', 'yiling');
    await target.goto(wrongStore.href);
    const excluded = results.getByText(/\d+ 条订单行 · \d+ 条在原店铺范围内不可查/u);
    await excluded.waitFor();
    const excludedCount = /· (\d+) 条在原店铺范围内不可查/u.exec(await excluded.innerText())?.[1];
    assert.ok(Number(excludedCount) >= 300, '改成另一店铺时，300 条达肤妍专属合成记录均须被排除');
    const missingResume = new URL(address);
    missingResume.hash = 'follow-up-login=d10c6d8b-f7e7-48c7-a086-02a4283f1072';
    await target.goto(missingResume.href);
    await target.getByText('登录成功，暂时无法恢复这组订单', { exact: true }).waitFor();
    await target.getByRole('link', { name: '回到工作台', exact: true }).waitFor();
  } finally {
    await context.close();
  }
}

async function signInFromCopiedAddress(page: Page, address: URL) {
  await page.route('**/api/v1/meta/auth', (route) => route.fulfill({ json: { mode: 'feishu' } }));
  await page.route('**/api/v1/auth/feishu/start?*', async (route) => {
    const { searchParams } = new URL(route.request().url());
    const to = searchParams.get('returnTo');
    assert.ok(to && to.length < 2000 && !to.includes(sampleId));
    const stored = await page.request.post(new URL('/api/v1/auth/dev/login', address).href, {
      data: { userId: '0199f0a0-0000-7000-8000-000000000005', accessCode: process.env.DEV_ACCESS_CODE },
    });
    assert.ok(stored.ok());
    await route.fulfill({ status: 302, headers: { location: to } });
  });
  await page.goto(address.href);
  await page.getByRole('button', { name: '使用飞书登录', exact: true }).press('Enter');
  await page.waitForURL((url) => url.href === address.href);
}

async function checkCopiedRiskDetail(page: Page, results: Locator) {
  const initialEntry = results.locator(`tr[data-row-key^="${sampleId}"]`).first();
  const previousId = await initialEntry.getAttribute('data-row-key');
  await results.getByText('2', { exact: true }).click();
  await results.locator(`tr[data-row-key="${previousId}"]`).waitFor({ state: 'hidden' });
  const selectedId = await initialEntry.getAttribute('data-row-key');
  const entry = results.locator(`tr[data-row-key="${selectedId}"]`).getByRole('link');
  await entry.waitFor();
  const source = new URL(page.url());
  assert.equal(source.searchParams.get('page'), '2');
  const destination = new URL(await entry.getAttribute('href') ?? '', source);
  const po = await entry.innerText();
  assert.ok(destination.search.length < 2000 && destination.hash.length > 16_384);
  await entry.press('Enter');
  await page.waitForURL((url) => url.href === destination.href);
  await page.getByRole('heading', { name: po, exact: true }).waitFor();
  await page.goBack();
  await page.waitForURL((url) => url.href === source.href);
  await assertRiskEntryFocus(page, { entry, route: '浏览器后退' });
  assert.equal((await page.goto(destination.href))?.status(), 200);
  await page.getByRole('heading', { name: po, exact: true }).waitFor();
  await page.getByRole('link', { name: '返回按店铺交付', exact: true }).press('Enter');
  await page.waitForURL((url) => url.href === source.href);
  await assertRiskEntryFocus(page, { entry, route: '复制详情后显式返回' });
}

async function assertRiskEntryFocus(page: Page, { entry, route }: { readonly entry: Locator; readonly route: string }) {
  await entry.and(page.locator(':focus')).waitFor().catch(async (error: unknown) => {
    const actual = await page.evaluate(() => {
      const { key, workbenchDetailOrigin: origin } = window.history.state ?? {};
      const { pathname, search, hash } = window.location;
      return { id: document.activeElement?.id, tag: document.activeElement?.tagName, key,
        markerKey: origin?.sourceKey, samePath: origin?.detailPath === pathname + search + hash,
        target: origin?.sourceLink, targetExists: document.getElementById('detail-link:' + origin?.sourceLink) !== null };
    });
    throw new Error(`${route}未恢复原风险订单焦点，当前焦点 ${JSON.stringify(actual)}`, { cause: error });
  });
}
