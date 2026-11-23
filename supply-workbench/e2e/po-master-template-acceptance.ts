import assert from 'node:assert/strict';
import type { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page, Request, Response } from '../node_modules/.pnpm/node_modules/playwright/index.js';
import type * as SheetJS from '../node_modules/.pnpm/node_modules/xlsx/types/index.js';

const fileName = 'po-master-v1.xlsx';
const dataSheet = '采购订单总表';
const fileType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const sample = {
  oa: 'XPKA(CN)9999',
  po: 'PO20261101009999',
  barcode: '0000000000001',
  name: '模板验收示例面霜',
};
type Scenario = { readonly page: Page; readonly origin: URL; readonly out: string; readonly xlsx: typeof SheetJS };
type Upload = { readonly name: string; readonly mimeType: string; readonly buffer: Buffer };

export async function checkPoMasterTemplate(scenario: Scenario) {
  const { page, origin, xlsx } = scenario;
  const downloaded = await downloadTemplate(scenario);
  const book = xlsx.read(downloaded.bytes);
  assert.deepEqual(book.SheetNames, [dataSheet, '说明']);
  const [headers, data] = xlsx.utils.sheet_to_json<string[]>(book.Sheets[dataSheet], { header: 1 });
  assert.equal(headers.length, 19);
  assert.deepEqual(headers.slice(-2), ['采购负责人', '工厂']);
  assert.equal(data, undefined);

  book.Sheets[dataSheet] = xlsx.utils.aoa_to_sheet([headers.filter((column) => column !== '状态')]);
  await uploadWorkbook(page, uploadOf({ xlsx, book, name: 'hz21-missing-header.xlsx' }));
  await page.getByRole('button', { name: '查看识别说明', exact: true }).click();
  await page.getByText(/采购订单总表 · 0 分 · 缺少 状态/u).waitFor();

  const values = new Map<string, string | number>([
    ['OA需求编号', sample.oa], ['采购订单号', sample.po], ['产品条码', sample.barcode],
    ['产品名称', sample.name], ['供应商', '模板验收示例供应商'], ['订单数量', 100],
    ['OA提报时间', '2026-11-01'], ['OA需求时间', '2026-11-20'], ['状态', '进行中'],
  ]);
  book.Sheets[dataSheet] = xlsx.utils.aoa_to_sheet([headers, headers.map((column) => values.get(column) ?? null)]);
  const file = uploadOf({ xlsx, book, name: 'hz21-order.xlsx' });
  const firstBatch = await importWorkbook({ page, origin, file, action: '新建' });
  const lineId = await readImportedLine({ page, origin, batch: firstBatch });
  const replayBatch = await importWorkbook({ page, origin, file, action: '不变' });
  assert.notEqual(replayBatch, firstBatch);
  assert.equal(await readImportedLine({ page, origin, batch: replayBatch }), lineId);
  const link = page.getByRole('link', { name: sample.po, exact: true });
  await page.goto(new URL('/lines?lane=finished&q=' + sample.po, origin).href);
  await link.waitFor();
  assert.equal(await link.count(), 1);
  await link.click();
  await page.waitForURL((url) => decodeURIComponent(url.pathname) === '/lines/' + lineId);
  return { fileName, ...downloaded.evidence, headerCount: headers.length, blankRows: 0, missingColumn: '状态', firstBatch, replayBatch, lineId, oa: sample.oa, po: sample.po, replayCreated: 0 };
}

async function downloadTemplate({ page, origin, out }: Scenario) {
  const requests: string[] = [];
  const track = (request: Request) => {
    const url = new URL(request.url());
    if (url.origin === origin.origin && url.pathname.startsWith('/api/')) requests.push(url.pathname);
  };
  page.on('request', track);
  try {
    const [history] = await Promise.all([
      page.waitForResponse((response) => isResponse(response, '/api/v1/imports', 'GET')),
      page.goto(new URL('/imports', origin).href),
    ]);
    assert.ok(history.ok());
    const link = page.getByRole('link', { name: '下载采购订单总表模板', exact: true });
    await link.waitFor();
    const firstScreen = requests.slice();
    assert.ok(firstScreen.every((path) => !path.startsWith('/api/v1/templates/')));
    const [download] = await Promise.all([page.waitForEvent('download'), link.press('Enter')]);
    assert.equal(download.suggestedFilename(), fileName);
    const path = join(out, fileName);
    await download.saveAs(path);
    const bytes = await readFile(path);
    const templateRequests = requests.filter((path) => path.startsWith('/api/v1/templates/'));
    assert.deepEqual(templateRequests, ['/api/v1/templates/' + fileName]);
    return { bytes, evidence: { firstScreen, templateRequests, sha256: createHash('sha256').update(bytes).digest('hex') } };
  } finally {
    page.off('request', track);
  }
}

function uploadOf({ xlsx, book, name }: { readonly xlsx: typeof SheetJS; readonly book: SheetJS.WorkBook; readonly name: string }): Upload {
  return { name, mimeType: fileType, buffer: xlsx.write(book, { bookType: 'xlsx', type: 'buffer' }) };
}

async function uploadWorkbook(page: Page, file: Upload): Promise<void> {
  const [detected] = await Promise.all([
    page.waitForResponse((response) => isResponse(response, '/api/v1/imports/detect', 'POST')),
    page.locator('input[type="file"]').setInputFiles(file),
  ]);
  assert.ok(detected.ok());
}

async function importWorkbook({ page, origin, file, action }: { readonly page: Page; readonly origin: URL; readonly file: Upload; readonly action: '新建' | '不变' }) {
  await page.goto(new URL('/imports', origin).href);
  await uploadWorkbook(page, file);
  await page.getByRole('button', { name: '查看识别说明', exact: true }).click();
  await page.getByText(/采购订单总表 · 100 分 · 17 列表头齐全/u).waitFor();
  await page.getByRole('button', { name: '开始解析', exact: true }).click();
  await page.waitForURL(/\/imports\/[^/]+$/u);
  await page.getByText('待确认 · 共 1 行 · ' + action + ' 1 行', { exact: true }).waitFor();
  await page.getByText('完整快照', { exact: true }).waitFor();
  await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await page.getByText('已提交 · 共 1 行 · ' + action + ' 1 行', { exact: true }).waitFor();
  return new URL(page.url()).pathname;
}

async function readImportedLine({ page, origin, batch }: { readonly page: Page; readonly origin: URL; readonly batch: string }) {
  const response = await page.request.get(new URL('/api/v1' + batch + '/rows', origin).href);
  assert.ok(response.ok());
  const { items } = await response.json();
  assert.equal(items.length, 1);
  const [row] = items;
  assert.equal(row.parsed.oaDemandRef.value, sample.oa);
  assert.equal(row.parsed.po.value.poNorm, sample.po);
  assert.equal(row.parsed.barcodeRaw.value, sample.barcode);
  assert.ok(typeof row.targetId === 'string' && row.targetId.length > 0);
  return row.targetId;
}

function isResponse(response: Response, path: string, method: 'GET' | 'POST'): boolean {
  return new URL(response.url()).pathname === path && response.request().method() === method;
}
