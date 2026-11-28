import assert from 'node:assert/strict';
import { join } from 'node:path';
import type { Locator, Page, Route } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import { checkHomeRiskFollowUp } from './home-risk-follow-up-acceptance.ts';

const store = 'dafuyan';
const materialPo = 'PO20261117009103';
const finishedPo = 'PO20261117009001';
const finishedName = '测试成品水';

type ScopedLine = {
  readonly id: string;
  readonly lane: 'finished' | 'material';
  readonly nameRaw: string | null;
  readonly po: { readonly poRaw: string | null };
  readonly nextDue: { readonly dateBuyerConfirmed: string | null } | null;
  readonly storeProgress?: { readonly materials: readonly { readonly id: string }[] };
};

export async function checkFollowUpDelivery({ page, buyer, origin, out, warehouse }: {
  readonly page: Page;
  readonly buyer: Page;
  readonly origin: URL;
  readonly out: string;
  readonly warehouse: string;
}) {
  const listing = await page.request.get(new URL('/api/v1/lines?store=dafuyan&pageSize=200', origin).href);
  assert.ok(listing.ok(), await listing.text());
  const { items }: { items: readonly ScopedLine[] } = await listing.json();
  const material = items.find((line) => line.po.poRaw === materialPo && line.lane === 'material');
  const finished = items.find((line) => line.po.poRaw === finishedPo && line.nameRaw === finishedName);
  assert.ok(material && finished?.storeProgress?.materials.some(({ id }) => id === material.id));
  const requests: URL[] = [];
  const watch = (request: { url(): string }) => requests.push(new URL(request.url()));
  page.on('request', watch);
  for (const { width, height } of [{ width: 1440, height: 900 }, { width: 320, height: 667 }]) {
    await page.setViewportSize({ width, height });
    await page.goto(new URL('/lines?store=dafuyan', origin).href);
    await page.getByRole('radiogroup', { name: '订单查法' }).getByRole('radio', { name: '按店铺交付', exact: true }).press('Space');
    const region = page.getByRole('region', { name: '按店铺交付结果' });
    const sourceRow = region.locator(`tr[data-row-key="${finished.id}"]`);
    await sourceRow.getByRole('link', { name: width === 320 ? new RegExp(finishedPo) : finishedName }).first().waitFor();
    const start = requests.length;
    await sourceRow.getByRole('button', { name: /展开|expand/iu }).press('Enter');
    const detail = region.getByRole('region', { name: '成品与关联采购事项' }).filter({ hasText: materialPo });
    const source = detail.getByRole('link', { name: new RegExp(materialPo) });
    await source.waitFor();
    assert.equal(rowDetails(requests.slice(start)).length, 0, '展开只使用店铺列表已有的数据');
    assert.match(await source.ariaSnapshot(), new RegExp(materialPo));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    const sourceUrl = page.url();
    await page.screenshot({ path: join(out, `follow-up-delivery-${width}.png`), animations: 'disabled' });
    for (const fromButton of [true, false]) {
      await source.press('Enter');
      await page.waitForURL((url) => decodeURIComponent(url.pathname) === '/lines/' + material.id && url.searchParams.get('store') === store);
      const related = page.getByRole('region', { name: '采购事项来源' });
      await related.getByRole('heading', { name: '关联成品', exact: true }).waitFor();
      assert.equal(await related.locator('a[href^="/lines/"]').count(), 3);
      if (fromButton) await page.getByRole('link', { name: '返回按店铺交付', exact: true }).press('Enter');
      else await page.goBack();
      await page.waitForURL(sourceUrl);
      await source.and(page.locator(':focus')).waitFor();
    }
  }
  page.off('request', watch);
  const visitedDetails = new Set(rowDetails(requests));
  assert.deepEqual([...visitedDetails], [material.id]);
  await page.setViewportSize({ width: 1440, height: 900 });

  const today = businessDate(0);
  const tomorrow = businessDate(1);
  const overdue = businessDate(-2);
  const late = items.find((line) => line.lane === 'finished' && line.nextDue === null
    && line.storeProgress?.materials.some(({ id }) => id === material.id));
  assert.ok(late);
  const lateBatch = await seedBatch(buyer, origin, { lineId: late.id, warehouse, dateBuyerConfirmed: tomorrow, dateFactoryRequired: today });
  await seedBatch(buyer, origin, { lineId: material.id, warehouse, dateBuyerConfirmed: overdue });
  const daily = new URL('/lines?lens=delivery&store=dafuyan', origin);
  const before = await chronologicalCount(page, daily);
  const due = items.find((line) => line.lane === 'finished' && line.id !== late.id && line.nextDue === null);
  assert.ok(due);
  const dueBatches: string[] = [];
  for (const offset of [-2, -1]) {
    const batch = await seedBatch(buyer, origin, { lineId: due.id, warehouse, dateBuyerConfirmed: businessDate(offset) });
    dueBatches.push(batch.id);
  }
  const after = await chronologicalCount(page, daily);
  assert.equal(after - before, 1);
  await checkRiskPageReturn({ page, daily, today, lineId: late.id, batchId: lateBatch.id });
  const address = new URL(daily);
  address.searchParams.set('riskDate', today);
  for (const id of [material.id, late.id]) address.searchParams.append('riskLine', id);
  await page.goto(address.href);
  const results = page.getByRole('region', { name: '首页交期风险结果' });
  await assertRisk(results, material.id, '已逾期');
  await assertRisk(results, late.id, '确认到货晚于需求');
  assert.equal(await results.locator('tr[data-row-key]').count(), 2);
  assert.equal(await page.getByRole('button', { name: /^成品逾期未到/ }).count(), 0);

  const invalid = new URL(daily);
  invalid.searchParams.set('riskDate', today);
  await page.goto(invalid.href);
  await page.getByText('这组订单的店铺、日期或范围不完整。').waitFor();
  assert.equal(await page.getByRole('region', { name: '按店铺交付结果' }).count(), 0);
  const homeRisk = await checkHomeRiskFollowUp({ page, origin, out, material: { id: material.id, po: materialPo },
    finished: { id: late.id, batch: lateBatch, arrivalDate: tomorrow } });
  await checkDailyReturn({ page: buyer, daily, lineId: due.id, batches: dueBatches, newDate: tomorrow });
  return { source: finished.id, material: material.id, relatedFinished: 3, views: [1440, 320],
    wideAndNarrowReturnFocus: true, secondRiskPageReturnFocus: true, dailyReturnFocusAndFallback: true, explicitlySelectedDetailIds: [...visitedDetails],
    originalRiskRows: [material.id, late.id], chronologicalOpenOverdueRowsBefore: before, chronologicalOpenOverdueRowsAfter: after, homeRisk };
}

async function checkRiskPageReturn({ page, daily, today, lineId, batchId }: {
  readonly page: Page; readonly daily: URL; readonly today: string; readonly lineId: string; readonly batchId: string;
}) {
  const address = new URL(daily);
  address.searchParams.set('riskDate', today);
  const ids = Array.from({ length: 50 }, (_, index) => `synthetic-risk-${index + 1}`);
  for (const id of [...ids, lineId]) address.searchParams.append('riskLine', id);
  const riskListing = (url: URL) => url.pathname === '/api/v1/lines' && url.searchParams.getAll('lineIds').includes(ids[0] ?? '');
  let isSourceVisible = true;
  const addSyntheticRows = async (route: Route) => {
    const response = await route.fetch();
    assert.ok(response.ok(), await response.text());
    const { items, page: pagination }: { items: readonly ScopedLine[]; page: { page: number; pageSize: number; total: number } } = await response.json();
    const real = items.find((line) => line.id === lineId);
    assert.ok(real, '第 2 页需使用可打开真实详情的隔离库订单');
    const synthetic = ids.map((id) => ({ ...real, id, po: { ...real.po, poRaw: id } }));
    const displayed = isSourceVisible ? [...synthetic, real] : synthetic;
    await route.fulfill({ response, json: { items: displayed, page: { ...pagination, total: displayed.length } } });
  };
  await page.route(riskListing, addSyntheticRows);
  try {
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 667 : 900 });
      await page.goto(address.href);
      const results = page.getByRole('region', { name: '首页交期风险结果' });
      await results.getByText('51 条订单行', { exact: true }).waitFor();
      const target = results.locator(`tr[data-row-key="${lineId}"]`).getByRole('link');
      assert.equal(await target.count(), 0);
      await results.getByText('2', { exact: true }).click();
      await target.waitFor();
      for (const fromButton of [true, false]) {
        await target.press('Enter');
        await page.waitForURL((url) => url.pathname === `/lines/${lineId}` && url.searchParams.get('focusBatch') === batchId);
        if (fromButton) await page.getByRole('link', { name: '返回按店铺交付', exact: true }).press('Enter');
        else await page.goBack();
        await results.getByText('51 条订单行', { exact: true }).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('page'), '2', '从订单详情返回应保留交期风险第 2 页');
        await target.and(page.locator(':focus')).waitFor();
      }
      if (width === 320) {
        await target.press('Enter');
        isSourceVisible = false;
        await page.getByRole('link', { name: '返回按店铺交付', exact: true }).press('Enter');
        await results.getByText('当前页找不到原记录入口，已保留查询。', { exact: true }).waitFor();
        await results.and(page.locator(':focus')).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('page'), '2');
      }
    }
  } finally {
    await page.unroute(riskListing, addSyntheticRows);
    await page.setViewportSize({ width: 1440, height: 900 });
  }
}

async function checkDailyReturn({ page, daily, lineId, batches, newDate }: {
  readonly page: Page; readonly daily: URL; readonly lineId: string; readonly batches: readonly string[]; readonly newDate: string;
}) {
  const address = new URL(daily);
  address.searchParams.set('drill', 'overdue');
  const results = page.getByRole('region', { name: '按店铺交付结果' });
  const row = results.locator(`tr[data-row-key="${lineId}"]`);
  const order = row.getByRole('link').first();
  const overdue = row.getByRole('link', { name: /^查看逾期批次/u });
  const note = row.getByRole('link', { name: '查看订单行详情', exact: true });
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: width === 320 ? 667 : 900 });
    await page.goto(address.href);
    const sources = [{ link: order, batchId: null }, { link: overdue, batchId: batches[0] }];
    if (width === 1440) sources.push({ link: note, batchId: null });
    for (const { link, batchId } of sources) {
      for (const fromButton of [true, false]) {
        await link.press('Enter');
        await page.waitForURL((url) => url.pathname === `/lines/${lineId}` && url.searchParams.get('focusBatch') === batchId);
        if (fromButton) await page.getByRole('link', { name: '返回按店铺交付', exact: true }).press('Enter');
        else await page.goBack();
        await page.waitForURL(address.href);
        await link.and(page.locator(':focus')).waitFor();
      }
    }
  }
  await overdue.press('Enter');
  for (const id of batches) {
    const saved = await page.request.patch(new URL(`/api/v1/batches/${encodeURIComponent(id)}`, daily).href,
      { data: { dateBuyerConfirmed: newDate, reason: '隔离验收更新确认到货日' } });
    assert.ok(saved.ok(), await saved.text());
  }
  await page.getByRole('link', { name: '返回按店铺交付', exact: true }).press('Enter');
  await page.waitForURL(address.href);
  await results.getByText('当前页找不到原记录入口，已保留筛选。', { exact: true }).waitFor();
  await results.and(page.locator(':focus')).waitFor();
  assert.equal(await row.count(), 0);
}

function rowDetails(requests: readonly URL[]): string[] {
  return requests.flatMap((url) => {
    const found = /^\/api\/v1\/lines\/([^/]+)(?:\/timeline)?$/u.exec(url.pathname)?.[1];
    return found === undefined || found === 'summary' ? [] : [decodeURIComponent(found)];
  });
}

function businessDate(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
}

async function seedBatch(page: Page, origin: URL, { lineId, warehouse, dateBuyerConfirmed, dateFactoryRequired }: {
  readonly lineId: string; readonly warehouse: string; readonly dateBuyerConfirmed: string; readonly dateFactoryRequired?: string;
}) {
  const response = await page.request.post(new URL(`/api/v1/lines/${encodeURIComponent(lineId)}/batches`, origin).href, {
    data: { receiverPartyId: warehouse, plannedQty: 50, dateBuyerConfirmed, dateFactoryRequired },
  });
  assert.ok(response.ok(), await response.text());
  const batch: unknown = await response.json();
  assert.ok(typeof batch === 'object' && batch !== null && 'id' in batch && typeof batch.id === 'string'
    && 'seq' in batch && typeof batch.seq === 'number');
  return { id: batch.id, seq: batch.seq };
}

async function chronologicalCount(page: Page, daily: URL) {
  await page.goto(daily.href);
  const trigger = page.getByRole('button', { name: /^成品逾期未到 /u });
  await trigger.waitFor();
  return Number((await trigger.innerText()).match(/[\d,]+/u)?.[0]?.replaceAll(',', ''));
}

async function assertRisk(results: Locator, lineId: string, reason: string) {
  await results.locator(`tr[data-row-key="${lineId}"]`).getByText(reason, { exact: true }).waitFor();
}
