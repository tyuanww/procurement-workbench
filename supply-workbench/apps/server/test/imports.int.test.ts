import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { devAuth } from '@sw/auth';
import { ImportBatchSummarySchema, ProcurementPreviewSelectionSchema } from '@sw/contracts';
import { createDb, importBatchRepository, importQueries, migrate, seed, userDirectory, type SqlExec } from '@sw/persistence';
import { composeImports, importTriggers } from '../src/composition/imports.js';
import { buildHttpApp } from '../src/http/app.js';
import { assertUpload, registerImportRoutes } from '../src/http/imports/routes.js';
import { loginAs } from './helpers/server.js';
import { demoPo, importCsv } from './helpers/synthetic-imports.js';

it('显式模板缺代工厂时拒绝，所选类型写入批次', async () => {
  const opened = await openHttp();
  const buyer = await loginAs(opened.app, 'buyer');
  const csv = Buffer.from('供应商,产品名称\n示例工厂,面膜\n');
  const detected = await opened.app.inject({ method: 'POST', url: '/api/v1/imports/detect', headers: { cookie: buyer, ...multipart('choice.csv', csv).headers }, payload: multipart('choice.csv', csv).body });
  expect(detected.statusCode).toBe(200);
  const body = detected.json();
  expect(body.requiresFactory).toBe(false);
  const fileId = textField(body, 'fileId');
  const missingFactory = await opened.app.inject({ method: 'POST', url: '/api/v1/imports', headers: { cookie: buyer, 'content-type': 'application/json' }, payload: { fileId, template: 'factory-progress-v1' } });
  expect(missingFactory.statusCode).toBe(400);
  expect(missingFactory.json()).toMatchObject({ error: { code: 'IMPORT_FACTORY_REQUIRED' } });
  const unknown = await opened.app.inject({ method: 'POST', url: '/api/v1/imports', headers: { cookie: buyer, 'content-type': 'application/json' }, payload: { fileId, template: 'not-a-template' } });
  expect(unknown.statusCode).toBe(400);
  expect(unknown.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
  const started = await opened.app.inject({ method: 'POST', url: '/api/v1/imports', headers: { cookie: buyer, 'content-type': 'application/json' }, payload: { fileId, template: 'bom-v1' } });
  expect(started.statusCode).toBe(200);
  expect(started.json()).toMatchObject({ template: 'bom-v1' });
  await opened.close();
});

it('类型不对或文件过大时拒绝上传', () => {
  expect(() => assertUpload({ fileName: 'notes.txt', bytes: new Uint8Array([1]) })).toThrow(expect.objectContaining({ code: 'FILE_TYPE_NOT_ALLOWED' }));
  expect(() => assertUpload({ fileName: 'big.csv', bytes: new Uint8Array(50 * 1024 * 1024 + 1) })).toThrow(expect.objectContaining({ code: 'FILE_TOO_LARGE' }));
});

it('上传接口拒绝错误类型，管理层上传返回 403', async () => {
  const opened = await openHttp();
  const buyer = await loginAs(opened.app, 'buyer');
  const manager = await loginAs(opened.app, 'manager');
  const wrong = await opened.app.inject({ method: 'POST', url: '/api/v1/imports/detect', headers: { cookie: buyer, ...multipart('notes.txt', Buffer.from('x')).headers }, payload: multipart('notes.txt', Buffer.from('x')).body });
  const denied = await opened.app.inject({ method: 'POST', url: '/api/v1/imports/detect', headers: { cookie: manager, ...multipart('po.csv', Buffer.from('a')).headers }, payload: multipart('po.csv', Buffer.from('a')).body });
  expect(wrong.statusCode).toBe(415);
  expect(wrong.json()).toMatchObject({ error: { code: 'FILE_TYPE_NOT_ALLOWED' } });
  expect(denied.statusCode).toBe(403);
  expect(denied.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  const template = await opened.app.inject({ method: 'GET', url: '/api/v1/templates/factory-progress-v1.xlsx', headers: { cookie: buyer } });
  expect(template.statusCode).toBe(200);
  expect(template.rawPayload[0]).toBe(0x50);
  await opened.close();
});

it.each(['误标', '截断'])('采购上传%s的 XLSX 时收到换文件提示', async (kind) => {
  const workbook = readFileSync(new URL('../../../fixtures/synthetic/po-master-procurement.xlsx', import.meta.url));
  const bytes = kind === '误标' ? Buffer.from('供应商,产品名称\n示例工厂,面膜\n') : workbook.subarray(0, workbook.length - 22);
  const upload = multipart('采购总表.xlsx', bytes);
  const opened = await openHttp();
  try {
    const cookie = await loginAs(opened.app, 'buyer');
    const detected = await opened.app.inject({ method: 'POST', url: '/api/v1/imports/detect', headers: { cookie, ...upload.headers }, payload: upload.body });
    expect({ status: detected.statusCode, body: detected.json() }).toMatchObject({
      status: 400,
      body: { error: {
        code: 'VALIDATION_FAILED',
        message: '无法解析文件。请更换文件，或从原系统重新导出 XLSX 后再上传。',
        details: { reason: 'file_unreadable' },
      } },
    });
  } finally {
    await opened.close();
  }
});

it('采购大表预览保留共用子件与源行，刷新后仍可查且不写订单', async () => {
  const opened = await openHttp();
  try {
    const cookie = await loginAs(opened.app, 'buyer');
    const before = await count(opened.exec, 'order_lines');
    const workbook = readFileSync(new URL('../../../fixtures/synthetic/po-master-procurement.xlsx', import.meta.url));
    const upload = multipart('采购总表.xlsx', workbook);
    const detected = await opened.app.inject({ method: 'POST', url: '/api/v1/imports/detect', headers: { cookie, ...upload.headers }, payload: upload.body });
    expect(detected.statusCode).toBe(200);

    const started = await opened.app.inject({ method: 'POST', url: '/api/v1/imports', headers: { cookie }, payload: { fileId: textField(detected.json(), 'fileId'), template: 'po-master-v1' } });
    expect(started.statusCode).toBe(200);
    const { id, hasProcurementPreview } = ImportBatchSummarySchema.parse(started.json());
    expect(hasProcurementPreview).toBe(true);
    const previewUrl = `/api/v1/imports/${id}/procurement?oa=XPKA(CN)9901`;
    const preview = await opened.app.inject({ method: 'GET', url: previewUrl, headers: { cookie } });
    expect(preview.statusCode).toBe(200);
    const procurement = ProcurementPreviewSelectionSchema.parse(preview.json());
    expect(procurement?.finishedRows.filter((row) => row.oaRefs.some((ref) => ref.main === 'XPKA(CN)9901'))).toHaveLength(3);
    expect(procurement?.componentFacts.filter((fact) => fact.componentCodeRaw === '99010003')).toEqual([
      expect.objectContaining({ source: { sheetName: '达肤妍项目进度表', rowNo: 5 }, quantity: 200000 }),
    ]);
    expect(procurement?.links.filter((link) => link.component.rowNo === 5 && link.component.sheetName === '达肤妍项目进度表')).toEqual(expect.arrayContaining([
      expect.objectContaining({ finishedRow: { sheetName: '采购订单总表', rowNo: 2 }, kind: 'shared' }),
      expect.objectContaining({ finishedRow: { sheetName: '采购订单总表', rowNo: 3 }, kind: 'shared' }),
    ]));
    expect(procurement?.links.filter((link) => link.component.rowNo === 3 && link.component.sheetName === '达肤妍项目进度表').map((link) => link.kind)).toEqual(['group', 'group']);

    const reloaded = await opened.app.inject({ method: 'GET', url: previewUrl, headers: { cookie } });
    expect(ProcurementPreviewSelectionSchema.parse(reloaded.json())).toEqual(procurement);
    const manager = await loginAs(opened.app, 'manager');
    expect((await opened.app.inject({ method: 'GET', url: previewUrl, headers: { cookie: manager } })).statusCode).toBe(403);
    expect(await count(opened.exec, 'order_lines')).toBe(before);
  } finally {
    await opened.close();
  }
});

it('重导同一采购总表保留供应商审批，采购行不重复', async () => {
  const opened = await openDb();
  try {
    const file = { fileName: 'po-master.csv', bytes: demoPo(), template: 'po-master-v1' as const };
    const first = await importCsv(opened.api, file);
    expect(await count(opened.exec, 'order_lines')).toBe(3);
    expect(await count(opened.exec, 'party_aliases')).toBe(1);
    const view = await opened.queries.getBatch({ importBatchId: first });
    expect(view).toMatchObject({ file: { originalName: 'po-master.csv' }, template: 'po-master-v1' });
    const aliasId = await approveOneAlias(opened.exec);
    const second = await importCsv(opened.api, file);
    expect(await count(opened.exec, 'order_lines')).toBe(3);
    expect(await actions(opened.handle.db, second)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    expect(await aliasStatus(opened.exec, aliasId)).toBe('approved');
  } finally {
    await opened.close();
  }
});

it('过期导入的定时触发器在凌晨 3 点', () => {
  expect(importTriggers(async () => {})[0]).toMatchObject({ name: 'discard-stale-imports', cron: '0 3 * * *' });
});

async function openHttp() {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-import-'));
  const api = composeImports({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai' });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => { registerImportRoutes(server, api); },
  });
  return { app, exec: handle.exec, close: async () => { await app.close(); await handle.close(); await rm(uploadDir, { recursive: true }); } };
}

async function openDb() {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-import-'));
  const api = composeImports({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai' });
  return { handle, exec: handle.exec, api, queries: importQueries(handle.db), close: async () => { await handle.close(); await rm(uploadDir, { recursive: true }); } };
}

async function approveOneAlias(exec: SqlExec): Promise<string> {
  const listed = await exec('select id from party_aliases limit 1');
  const id = textOfRow(listed);
  await exec(`update party_aliases set status = 'approved' where id = '${id}'`);
  return id;
}

async function aliasStatus(exec: SqlExec, id: string): Promise<string> {
  const listed = await exec(`select status from party_aliases where id = '${id}'`);
  return textOfRow(listed, 'status');
}

function textOfRow(result: unknown, key = 'id'): string {
  const row = rowsOf(result)[0];
  if (!isRecord(row) || typeof row[key] !== 'string') throw new Error('没有别名');
  return row[key];
}

async function count(exec: SqlExec, table: string): Promise<number> {
  const result = await exec(`select count(*)::int as total from ${table}`);
  return totalOf(result);
}

function totalOf(result: unknown): number {
  const row = rowsOf(result)[0];
  if (typeof row !== 'object' || row === null || !('total' in row)) throw new Error('计数没有结果');
  return typeof row.total === 'number' ? row.total : Number(row.total);
}

function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return rowsOf(result[0]);
  if (typeof result === 'object' && result !== null && 'rows' in result && Array.isArray(result.rows)) return result.rows;
  throw new Error('计数没有结果');
}

async function actions(db: Awaited<ReturnType<typeof createDb>>['db'], batchId: string) {
  return (await importBatchRepository(db).listRows(batchId)).map((row) => row.action);
}

function textField(value: unknown, key: string): string {
  if (!isRecord(value) || typeof value[key] !== 'string') throw new Error(`没有 ${key}`);
  return value[key];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function multipart(fileName: string, body: Buffer) {
  const boundary = '----sw';
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: text/plain\r\n\r\n`),
      body,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}
