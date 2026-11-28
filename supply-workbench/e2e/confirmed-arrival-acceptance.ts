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

export async function checkConfirmedArrivalDownload({ page, devtools, browser, headless, origin, out, warehouse }: {
  readonly page: Page;
  readonly devtools: CDPSession;
  readonly browser: Browser;
  readonly headless: boolean;
  readonly origin: URL;
  readonly out: string;
  readonly warehouse: string;
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
    const roundTrip = await importOneConfirmedDate({ page, origin, book, secondBatchId });
    return { ...evidence, roundTrip };
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

async function importOneConfirmedDate({ page, origin, book, secondBatchId }: {
  readonly page: Page;
  readonly origin: URL;
  readonly book: ReturnType<typeof xlsx.read>;
  readonly secondBatchId: string;
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
  const preview = page.getByRole('region', { name: '确认到货日明细' });
  const batchRow = (id: string) => preview.getByRole('row').filter({ hasText: id });
  await batchRow(secondBatchId).getByRole('cell', { name: date, exact: true }).waitFor();
  await batchRow(firstBatchId).getByRole('cell', { name: /^跳过/ }).waitFor();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await page.getByText('已提交 · 共 2 行 · 更新 1 行 · 跳过 1 行', { exact: true }).waitFor();
  const drawer = page.getByRole('dialog', { name: '核对导入记录来源', exact: true });
  const target = drawer.getByRole('link', { name: '查看关联要货批次', exact: true });
  await batchRow(firstBatchId).getByRole('button', { name: /^查看来源/u }).press('Enter');
  await drawer.getByText('这条记录仅供当前导入核对。', { exact: true }).waitFor();
  assert.equal(await target.count(), 0);
  await page.keyboard.press('Escape');
  await drawer.waitFor({ state: 'hidden' });
  await batchRow(secondBatchId).getByRole('button', { name: /^查看来源/u }).press('Enter');
  await target.waitFor();
  const sourceUrl = page.url();
  await target.press('Enter');
  await page.waitForURL((url) => url.pathname === `/lines/${lineId}` && url.searchParams.get('focusBatch') === secondBatchId);
  await page.getByRole('region', { name: '批次', exact: true }).getByRole('listitem')
    .filter({ hasText: /^2 ·/u }).and(page.locator(':focus')).waitFor();
  await page.getByRole('link', { name: '返回导入批次', exact: true }).press('Enter');
  await page.waitForURL(sourceUrl);
  await target.and(page.locator(':focus')).waitFor();

  const response = await page.request.get(new URL(`/api/v1/lines/${lineId}`, origin).href);
  assert.ok(response.ok());
  const { batches } = await response.json();
  assert.equal(batches.length, 2);
  const actual = batches.map((batch: { id: string; dateBuyerConfirmed: string | null }) => [batch.id, batch.dateBuyerConfirmed]);
  assert.deepEqual(actual, [[firstBatchId, '2025-01-01'], [secondBatchId, date]]);
  return { submitted: { updated: 1, skipped: 1 }, confirmedDates: actual, followUp: { focusBatch: secondBatchId, skippedStaysLocal: true, explicitBackFocus: true } };
}
