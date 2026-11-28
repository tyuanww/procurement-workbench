import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { Browser, CDPSession, Download, Page, Request } from '../node_modules/.pnpm/node_modules/playwright/index.js';

const require = createRequire(new URL('../packages/report-renderers/package.json', import.meta.url));
const xlsx: typeof import('../node_modules/.pnpm/node_modules/xlsx/types/index.js') = require('xlsx');
const exportPath = '/api/v1/lines/bulk/confirmed-arrival.xlsx';
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const sheetName = '采购确认到货日';
const fileName = `${sheetName}.xlsx`;
const headers = ['要货批次ID', 'PO单号', '品名', '批次序号', '仓库', '导出时确认到货日', '采购确认到货日', '改期原因', '导出时收货方ID', '导出时订单行ID'];
const po = 'HZ09-0003';
const lineId = 'hz09-line-3';
const firstBatchId = 'hz09-batch-3';

type ExpectedSourceFailure = (path: string, status: number) => void;

export async function checkConfirmedArrivalDownload({ page, devtools, browser, headless, origin, out, warehouse, expectSourceFailure }: {
  readonly page: Page;
  readonly devtools: CDPSession;
  readonly browser: Browser;
  readonly headless: boolean;
  readonly origin: URL;
  readonly out: string;
  readonly warehouse: string;
  readonly expectSourceFailure: ExpectedSourceFailure;
}) {
  const secondBatchId = await splitSyntheticOrder(page, origin, warehouse);
  const directory = join(out, 'confirmed-arrival-download');
  await mkdir(directory);
  const { targetInfo: { browserContextId } } = await devtools.send('Target.getTargetInfo');
  assert.ok(browserContextId);
  const browserDevtools = await browser.newBrowserCDPSession();
  try {
    // Playwright normally names files by GUID. Let Chromium name the file in this directory.
    await browserDevtools.send('Browser.setDownloadBehavior', { browserContextId, behavior: 'allow', downloadPath: directory, eventsEnabled: true });
    const { evidence, book } = await downloadFromOrderLines({ page, origin, directory, headless });
    await writeFile(join(out, 'confirmed-arrival-download.json'), JSON.stringify(evidence, null, 2) + '\n');
    assert.deepEqual(evidence.savedFiles, [fileName]);
    assert.equal(evidence.suggestedFilename, fileName);
    assert.equal(evidence.status, 200);
    assert.equal(evidence.contentType, mime);
    assert.equal(evidence.contentDisposition, `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
    assert.equal(evidence.requestCount, 1);
    assert.equal(evidence.downloadCount, 1);
    assert.deepEqual(evidence.sheetNames, [sheetName]);
    assert.deepEqual(evidence.rows, [
      headers,
      [firstBatchId, po, '合成待催 3', '1', '我方仓库', '2025-01-01', '', '', warehouse, lineId],
      [secondBatchId, po, '合成待催 3', '2', '我方仓库', '未确认', '', '', warehouse, lineId],
    ]);
    const roundTrip = await importOneConfirmedDate({ page, origin, book, secondBatchId, expectSourceFailure });
    const pagination = await checkArrivalPagination(page, origin, expectSourceFailure);
    return { ...evidence, roundTrip, pagination };
  } finally {
    await browserDevtools.detach();
  }
}

async function splitSyntheticOrder(page: Page, origin: URL, warehouse: string): Promise<string> {
  const first = await page.request.patch(new URL(`/api/v1/batches/${firstBatchId}`, origin).href, { data: { plannedQty: 50 } });
  assert.ok(first.ok(), `拆分第 1 批 HTTP ${first.status()}`);
  const second = await page.request.post(new URL(`/api/v1/lines/${lineId}/batches`, origin).href, {
    data: { plannedQty: 50, receiverPartyId: warehouse },
  });
  assert.ok(second.ok(), `生成第 2 批 HTTP ${second.status()}`);
  const { id } = await second.json();
  assert.equal(typeof id, 'string');
  return id;
}

async function downloadFromOrderLines({ page, origin, directory, headless }: {
  readonly page: Page;
  readonly origin: URL;
  readonly directory: string;
  readonly headless: boolean;
}) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(new URL(`/lines?lane=finished&q=${po}`, origin).href);
  const order = page.getByRole('row').filter({ has: page.getByRole('link', { name: po, exact: true }) });
  await order.getByRole('checkbox', { name: /^勾选订单行/ }).check();
  const exportButton = page.getByRole('button', { name: '导出确认日表', exact: true });
  await exportButton.waitFor();
  const endpoint = new URL(exportPath, origin).href;
  const isExport = (request: Request) => request.url() === endpoint && request.method() === 'POST';
  const requests: Request[] = [];
  const downloads: Download[] = [];
  const collectRequest = (request: Request) => { if (isExport(request)) requests.push(request); };
  const collectDownload = (download: Download) => { downloads.push(download); };
  page.on('request', collectRequest);
  page.on('download', collectDownload);
  try {
    const [response, download] = await Promise.all([
      page.waitForResponse((response) => isExport(response.request())),
      page.waitForEvent('download'),
      exportButton.click(),
    ]);
    assert.equal(await download.failure(), null);
    assert.deepEqual(response.request().postDataJSON(), { lineIds: [lineId] });
    const savedFiles = await readdir(directory);
    const [savedName] = savedFiles;
    assert.ok(savedName, '确认日表实际下载目录缺少文件');
    const bytes = await readFile(join(directory, savedName));
    const book = xlsx.read(bytes);
    const sheet = book.Sheets[sheetName];
    const evidence = {
      mode: headless ? 'headless' : 'headed',
      status: response.status(),
      contentType: await response.headerValue('content-type'),
      contentDisposition: await response.headerValue('content-disposition'),
      suggestedFilename: download.suggestedFilename(),
      downloadUrlScheme: new URL(download.url()).protocol,
      savedFiles,
      requestCount: requests.length,
      downloadCount: downloads.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sheetNames: book.SheetNames,
      rows: sheet ? xlsx.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }) : [],
    };
    return { book, evidence };
  } finally {
    page.off('request', collectRequest);
    page.off('download', collectDownload);
  }
}

async function importOneConfirmedDate({ page, origin, book, secondBatchId, expectSourceFailure }: {
  readonly page: Page;
  readonly origin: URL;
  readonly book: ReturnType<typeof xlsx.read>;
  readonly secondBatchId: string;
  readonly expectSourceFailure: ExpectedSourceFailure;
}) {
  const date = '2099-01-12';
  const sheet = book.Sheets[sheetName];
  assert.ok(sheet);
  sheet['G3'] = { t: 's', v: date };
  const buffer: Buffer = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
  await page.goto(new URL('/imports', origin).href);
  const [detected] = await Promise.all([
    page.waitForResponse((response) => response.url() === new URL('/api/v1/imports/detect', origin).href && response.request().method() === 'POST'),
    page.locator('input[type="file"]').setInputFiles({ name: fileName, mimeType: mime, buffer }),
  ]);
  assert.ok(detected.ok(), `确认日表识别 HTTP ${detected.status()}`);
  assert.equal((await detected.json()).candidates[0]?.template, 'batch-confirmed-arrival-v1');
  await page.getByRole('button', { name: '开始解析', exact: true }).click();
  await page.waitForURL(/\/imports\/[^/]+$/);
  const importUrl = new URL(page.url());
  const preview = page.getByRole('region', { name: '确认到货日明细' });
  const batchRow = (id: string) => preview.getByRole('row').filter({ hasText: id });
  await batchRow(secondBatchId).getByRole('cell', { name: date, exact: true }).waitFor();
  await batchRow(firstBatchId).getByRole('cell', { name: /^跳过/ }).waitFor();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await page.getByText('已提交 · 共 2 行 · 更新 1 行 · 跳过 1 行', { exact: true }).waitFor();
  const drawer = page.getByRole('dialog', { name: '核对导入记录来源', exact: true });
  const target = drawer.getByRole('link', { name: '查看关联要货批次', exact: true });
  const firstSource = batchRow(firstBatchId).getByRole('button', { name: /^查看来源/u });
  await firstSource.press('Enter');
  await drawer.getByText('这条记录仅供当前导入核对。', { exact: true }).waitFor();
  assert.equal(await target.count(), 0);
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await firstSource.and(page.locator(':focus')).waitFor();
  const secondSource = batchRow(secondBatchId).getByRole('button', { name: /^查看来源/u });
  await secondSource.press('Enter');
  await target.waitFor();
  const sourceUrl = page.url();
  const linkedOrder = new URL(await target.getAttribute('href') ?? '', origin);
  await target.press('Enter');
  await page.waitForURL((url) => url.pathname === `/lines/${lineId}` && url.searchParams.get('focusBatch') === secondBatchId);
  await page.getByRole('region', { name: '批次', exact: true }).getByRole('listitem')
    .filter({ hasText: /^2 ·/u }).and(page.locator(':focus')).waitFor();
  await page.getByRole('link', { name: '返回导入批次', exact: true }).press('Enter');
  await page.waitForURL(sourceUrl);
  await target.and(page.locator(':focus')).waitFor();
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await secondSource.and(page.locator(':focus')).waitFor();
  await checkUnavailableArrivalSource({ page, secondSource, expectSourceFailure });
  await checkMismatchedArrivalReturn(page, linkedOrder);

  const outside = new URL(importUrl);
  outside.searchParams.set('arrivalPage', '9');
  await page.goto(outside.href);
  await page.waitForURL(importUrl.href);
  await batchRow(secondBatchId).getByRole('cell', { name: date, exact: true }).waitFor();

  const response = await page.request.get(new URL(`/api/v1/lines/${lineId}`, origin).href);
  assert.ok(response.ok());
  const { batches } = await response.json();
  assert.equal(batches.length, 2);
  const actual = batches.map((batch: { id: string; dateBuyerConfirmed: string | null }) => [batch.id, batch.dateBuyerConfirmed]);
  assert.deepEqual(actual, [[firstBatchId, '2025-01-01'], [secondBatchId, date]]);
  return { submitted: { updated: 1, skipped: 1 }, confirmedDates: actual, outOfRangePageRecovered: true,
    followUp: { focusBatch: secondBatchId, skippedStaysLocal: true, explicitBackFocus: true, drawerEscapeFocus: true, unavailableWithoutRetry: [404, 403] } };
}

async function checkMismatchedArrivalReturn(page: Page, linkedOrder: URL) {
  linkedOrder.searchParams.set('focusBatch', firstBatchId);
  const source = new URL(linkedOrder.searchParams.get('backToImport') ?? '', linkedOrder);
  const rowsPath = '/api/v1' + source.pathname + '/rows';
  const [rows] = await Promise.all([
    page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === rowsPath && url.searchParams.get('page') === (source.searchParams.get('arrivalPage') ?? '1');
    }),
    page.goto(linkedOrder.href),
  ]);
  assert.ok(rows.ok());
  await page.getByRole('heading', { name: po, exact: true }).waitFor();
  await page.getByRole('region', { name: '订单详情' }).and(page.locator('[aria-busy="false"]')).waitFor();
  assert.equal(await page.getByRole('link', { name: '返回导入批次', exact: true }).count(), 0);
}

async function checkUnavailableArrivalSource({ page, secondSource, expectSourceFailure }: {
  readonly page: Page;
  readonly secondSource: ReturnType<Page['locator']>;
  readonly expectSourceFailure: ExpectedSourceFailure;
}) {
  const path = `/api/v1/lines/${lineId}`;
  const drawer = page.getByRole('dialog', { name: '核对导入记录来源', exact: true });
  for (const { status, code } of [{ status: 404, code: 'NOT_FOUND' }, { status: 403, code: 'FORBIDDEN' }]) {
    expectSourceFailure(path, status);
    await page.route((url) => url.pathname === path,
      (route) => route.fulfill({ status, json: { error: { code, message: '合成验收不可用记录', details: {} } } }), { times: 1 });
    await secondSource.press('Enter');
    await drawer.getByText('当前范围没有可查看的关联记录。', { exact: true }).waitFor();
    assert.equal(await drawer.getByRole('button', { name: '重试', exact: true }).count(), 0);
    assert.equal(await drawer.getByRole('link').count(), 0);
    await page.keyboard.press('Escape');
    await drawer.waitFor({ state: 'hidden' });
    await secondSource.and(page.locator(':focus')).waitFor();
  }
}

async function checkArrivalPagination(page: Page, origin: URL, expectSourceFailure: ExpectedSourceFailure) {
  const book = xlsx.utils.book_new();
  const rows = Array.from({ length: 21 }, (_, index) => [`hz09-fixture-batch-${index + 1}`, po, `分页合成 ${index + 1}`, 1, '我方仓库', '未确认', '', '', '', lineId]);
  xlsx.utils.book_append_sheet(book, xlsx.utils.aoa_to_sheet([headers, ...rows]), sheetName);
  const buffer: Buffer = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
  await page.goto(new URL('/imports', origin).href);
  await page.locator('input[type="file"]').setInputFiles({ name: '合成确认日分页.xlsx', mimeType: mime, buffer });
  await page.getByRole('button', { name: '开始解析', exact: true }).click();
  await page.waitForURL(/\/imports\/[^/]+$/);
  const preview = page.getByRole('region', { name: '确认到货日明细', exact: true });
  await preview.getByRole('cell', { name: '分页合成 20', exact: true }).waitFor();
  const pagination = page.getByRole('navigation', { name: /^确认到货日明细分页/u });
  await pagination.getByTitle('下一页', { exact: true }).press('Enter');
  await page.waitForURL((url) => url.searchParams.get('arrivalPage') === '2');
  await preview.getByRole('cell', { name: '分页合成 21', exact: true }).waitFor();
  assert.equal(await pagination.evaluate((nav) => nav.contains(document.activeElement)), true, '翻页后焦点应留在确认到货日分页');
  await checkArrivalSourcePage(page, preview, expectSourceFailure);
  return { rows: rows.length, nextPageFocus: true, staleSourcePageRecovered: true, unavailableSourceCanClear: true, failedSourceCanClear: true };
}

async function checkArrivalSourcePage(page: Page, preview: ReturnType<Page['locator']>, expectSourceFailure: ExpectedSourceFailure) {
  const trigger = preview.getByRole('row').filter({ hasText: '分页合成 21' }).getByRole('button', { name: /^查看来源/u });
  await trigger.press('Enter');
  const drawer = page.getByRole('dialog', { name: '核对导入记录来源', exact: true });
  await drawer.getByText(`${sheetName} 第 22 行`, { exact: true }).waitFor();
  const correct = new URL(page.url());
  const stale = new URL(correct);
  stale.searchParams.delete('arrivalPage');
  await page.goto(stale.href);
  await drawer.getByText(`${sheetName} 第 22 行`, { exact: true }).waitFor();
  await page.waitForURL((url) => url.searchParams.get('arrivalPage') === '2' && url.searchParams.get('source') === correct.searchParams.get('source'));
  await page.keyboard.press('Escape');
  await page.waitForURL((url) => url.searchParams.get('arrivalPage') === '2' && !url.searchParams.has('drawer'));
  await trigger.and(page.locator(':focus')).waitFor();

  const rowsPath = '/api/v1' + correct.pathname + '/rows';
  expectSourceFailure(rowsPath, 503);
  await page.route((url) => url.pathname === rowsPath && url.searchParams.get('page') === '2',
    (route) => route.fulfill({ status: 503, json: { error: { code: 'INTERNAL', message: '合成验收来源分页读取失败', details: {} } } }), { times: 1 });
  await page.goto(stale.href);
  await page.getByText('确认到货日预览没有读出来。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '清除来源定位', exact: true }).press('Enter');
  await page.waitForURL((url) => !url.searchParams.has('source') && !url.searchParams.has('drawer'));
  await preview.getByRole('cell', { name: '分页合成 20', exact: true }).waitFor();

  stale.searchParams.set('source', JSON.stringify(['arrival', sheetName, 999]));
  await page.goto(stale.href);
  await page.getByText('找不到链接中的来源记录。', { exact: true }).waitFor();
  await page.getByRole('button', { name: '清除来源定位', exact: true }).click();
  await page.waitForURL((url) => !url.searchParams.has('source') && !url.searchParams.has('drawer'));
  await preview.getByRole('cell', { name: '分页合成 20', exact: true }).waitFor();
}
