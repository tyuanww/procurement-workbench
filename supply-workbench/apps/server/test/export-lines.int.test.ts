import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { devAuth } from '@sw/auth';
import { createDb, migrate, seed, userDirectory } from '@sw/persistence';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import { composeFollowUp, followUpAttachmentMaxBytes } from '../src/composition/follow-up.js';
import { buildHttpApp, type HttpApp } from '../src/http/app.js';
import { registerFollowUpRoutes } from '../src/http/follow-up/routes.js';
import { loginAs } from './helpers/server.js';
import { at, seedFactoryTransit, seedLines } from './helpers/line-export-fixtures.js';

const CODE = 'dev-code';
const FILTERED = '/api/v1/lines/export.xlsx?lane=finished&supplierPartyId=sup-a&page=1&pageSize=1&hide=po,buyer,status&fields=id&barcodeRaw=SECRET-A';

let app: HttpApp;
let buyerCookie = '';
let noneCookie = '';
let closeAll: () => Promise<void> = async () => undefined;

beforeAll(async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  await seedLines(handle.db);
  await seedFactoryTransit(handle.db);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-export-'));
  const api = composeFollowUp({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai', clock: new FixedClock(at) });
  app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: CODE, secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => registerFollowUpRoutes({ app: server, api, attachmentMaxBytes: followUpAttachmentMaxBytes() }),
  });
  buyerCookie = await loginAs(app, 'buyer');
  noneCookie = await loginUser(app, 'user-none');
  closeAll = async () => {
    await app.close();
    await handle.close();
    await rm(uploadDir, { recursive: true });
  };
});

afterAll(async () => {
  await closeAll();
});

it('没登录不能导出，没有读权限的用户被拒绝', async () => {
  const anonymous = await app.inject({ method: 'GET', url: FILTERED });
  const denied = await app.inject({ method: 'GET', url: FILTERED, headers: { cookie: noneCookie } });
  expect(anonymous.statusCode).toBe(401);
  expect(denied.statusCode).toBe(403);
});

it('当前筛选跨页导出，隐藏列和请求里的额外字段不进文件', async () => {
  const response = await app.inject({ method: 'GET', url: FILTERED, headers: { cookie: buyerCookie } });
  expect(response.statusCode).toBe(200);
  const bytes = bytesOf(response.rawPayload);
  expect(headersOf(bytes)).toEqual(['采购单号', '品名', '供应商', '工厂', '订单数量', '已收（工作台）', '代工厂已交货', '阶段', '下一到货', '卡了几天']);
  expect(texts(bytes, '采购单号')).toEqual(['PO-A', 'PO-B']);
  expect(numberAt({ bytes, header: '订单数量', row: 0 })).toBe(0);
  expect(blankAt({ bytes, header: '订单数量', row: 1 })).toBe(true);
  expect(dateParts(cellAt({ bytes, header: '下一到货', row: 0 }).v)).toEqual({ y: 2026, m: 10, d: 1 });
  expect(blankAt({ bytes, header: '下一到货', row: 1 })).toBe(true);
  expect(valuesOf(bytes)).not.toContain('PO-C');
  expect(valuesOf(bytes)).not.toContain('SECRET-A');
  expect(valuesOf(bytes)).not.toContain('line-a');
  expect(valuesOf(bytes)).not.toContain('no_batch');
});

it('手机和窄屏列键与表格列一致，筛选全集仍在', async () => {
  const phone = await app.inject({ method: 'GET', url: '/api/v1/lines/export.xlsx?lane=finished&supplierPartyId=sup-a&page=9&pageSize=1&columns=po,name,stage,nextDue,daysInStage&hide=name', headers: { cookie: buyerCookie } });
  const phoneBytes = bytesOf(phone.rawPayload);
  expect(headersOf(phoneBytes)).toEqual(['采购单号', '品名', '阶段', '下一到货', '卡了几天']);
  expect(texts(phoneBytes, '采购单号')).toEqual(['PO-A', 'PO-B']);
  expect(dateParts(cellAt({ bytes: phoneBytes, header: '下一到货', row: 0 }).v)).toEqual({ y: 2026, m: 10, d: 1 });
  const narrow = await app.inject({ method: 'GET', url: '/api/v1/lines/export.xlsx?lane=finished&supplierPartyId=sup-a&columns=po,name,stage,daysInStage', headers: { cookie: buyerCookie } });
  expect(headersOf(bytesOf(narrow.rawPayload))).toEqual(['采购单号', '品名', '阶段', '卡了几天']);
});

it('buyer=me 只导出当前用户的行', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/lines/export.xlsx?lane=finished&buyer=me&page=2&pageSize=1', headers: { cookie: buyerCookie } });
  const bytes = bytesOf(response.rawPayload);
  expect(texts(bytes, '采购单号').sort()).toEqual(['PO-A', 'PO-B']);
  expect(valuesOf(bytes)).not.toContain('PO-C');
});

it('物料线导出物料列，需求日保持日期', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/lines/export.xlsx?lane=material&page=1&pageSize=1', headers: { cookie: buyerCookie } });
  const bytes = bytesOf(response.rawPayload);
  expect(headersOf(bytes)).toEqual(['物料采购单号', '材料品名', '供应商', '收货代工厂', '需求量', '已收', '阶段', '下一到货', '代工厂需求日', '卡了几天', '负责人']);
  expect(texts(bytes, '物料采购单号')).toEqual(['PO-M']);
  expect(dateParts(cellAt({ bytes, header: '代工厂需求日', row: 0 }).v)).toEqual({ y: 2026, m: 11, d: 2 });
  expect(headersOf(bytes)).not.toContain('工厂');
  expect(headersOf(bytes)).not.toContain('代工厂已交货');
});

it('没有命中时只返回表头', async () => {
  const response = await app.inject({ method: 'GET', url: '/api/v1/lines/export.xlsx?lane=finished&q=没有这个品', headers: { cookie: buyerCookie } });
  const bytes = bytesOf(response.rawPayload);
  expect(response.statusCode).toBe(200);
  expect(headersOf(bytes)[0]).toBe('采购单号');
  expect(texts(bytes, '采购单号')).toEqual([]);
});

it('宜侬在途按已关联工厂和实物在途量筛选，分页、汇总和导出一致', async () => {
  const get = (suffix: string) => app.inject({ method: 'GET', url: `/api/v1/lines${suffix}`, headers: { cookie: buyerCookie } });
  const filter = 'inTransitFactory=yinong';
  const [finished, second, material, allLanes, summary, exported, mine, ordinarySearch] = await Promise.all([
    get(`?${filter}&lane=finished&pageSize=1`),
    get(`?${filter}&lane=finished&pageSize=1&page=2`),
    get(`?${filter}&lane=material`),
    get(`?${filter}`),
    get(`/summary?${filter}&lane=finished&pageSize=1`),
    get(`/export.xlsx?${filter}&lane=finished&pageSize=1&page=2`),
    get(`?${filter}&lane=finished&buyer=me`),
    get('?q=%E5%AE%9C%E4%BE%AC'),
  ]);
  for (const response of [finished, second, material, allLanes, summary, exported, mine, ordinarySearch]) expect(response.statusCode).toBe(200);
  expect(finished.json()).toMatchObject({ items: [{ id: 'line-a' }], page: { total: 2, pageSize: 1 } });
  expect(second.json()).toMatchObject({ items: [{ id: 'line-transit' }], page: { total: 2, page: 2 } });
  expect(material.json()).toMatchObject({ items: [{ id: 'line-m' }], page: { total: 1 } });
  expect(allLanes.json().page.total).toBe(3);
  expect(summary.json()).toMatchObject({ total: 2, stages: [{ stage: 'awaiting_receipt', count: 2 }] });
  expect(texts(bytesOf(exported.rawPayload), '采购单号')).toEqual(['PO-A', 'PO-transit']);
  expect(mine.json()).toMatchObject({ items: [{ id: 'line-a' }], page: { total: 1 } });
  expect(ordinarySearch.json()).toMatchObject({ items: [{ id: 'line-c' }], page: { total: 1 } });
});

async function loginUser(opened: HttpApp, userId: string): Promise<string> {
  const login = await opened.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId, accessCode: CODE } });
  const header = login.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(';')[0] ?? '';
}

function bytesOf(payload: unknown): Uint8Array {
  if (payload instanceof Uint8Array) return payload;
  throw new Error('导出没有字节');
}

function headersOf(bytes: Uint8Array): string[] {
  const headers: string[] = [];
  for (let column = 0; column < columnCount(bytes); column += 1) headers.push(textAt({ bytes, row: 0, column }));
  return headers;
}

function texts(bytes: Uint8Array, header: string): string[] {
  const index = headersOf(bytes).indexOf(header);
  if (index < 0) throw new Error(`没有列 ${header}`);
  const values: string[] = [];
  for (let row = 1; row < rowCount(bytes); row += 1) values.push(textAt({ bytes, row, column: index }));
  return values;
}

type Spot = { readonly bytes: Uint8Array; readonly header: string; readonly row: number };

function numberAt(spot: Spot): unknown {
  const cell = cellAt(spot);
  expect(cell.t).toBe('n');
  return cell.v;
}

function blankAt(spot: Spot): boolean {
  const cell = cellAt(spot);
  return cell.v !== 0 && cell.v !== '0' && (cell.v === '' || cell.v === undefined) && cell.note.includes('不是 0');
}

function cellAt(spot: Spot): ReadCell {
  const index = headersOf(spot.bytes).indexOf(spot.header);
  if (index < 0) throw new Error(`没有列 ${spot.header}`);
  return readCell(spot.bytes, `${letters(index)}${spot.row + 2}`) ?? { t: 's', v: '', note: '' };
}

function textAt(input: { readonly bytes: Uint8Array; readonly row: number; readonly column: number }): string {
  const cell = readCell(input.bytes, `${letters(input.column)}${input.row + 1}`);
  return cell === undefined || cell.v === undefined ? '' : String(cell.v);
}

function valuesOf(bytes: Uint8Array): unknown[] {
  return Object.entries(readSheet(bytes)).flatMap(([key, cell]) => key.startsWith('!') || !isRecord(cell) ? [] : [cell.v]);
}

function rowCount(bytes: Uint8Array): number {
  return rangeOf(bytes).rows;
}

function columnCount(bytes: Uint8Array): number {
  return rangeOf(bytes).columns;
}

function rangeOf(bytes: Uint8Array): { readonly rows: number; readonly columns: number } {
  const ref = readSheet(bytes)['!ref'];
  if (typeof ref !== 'string') return { rows: 0, columns: 0 };
  const matched = /^[A-Z]+(\d+):([A-Z]+)(\d+)$/.exec(ref);
  const endColumn = matched?.[2];
  const endRow = matched?.[3];
  if (endColumn === undefined || endRow === undefined) return { rows: 1, columns: 1 };
  return { rows: Number(endRow), columns: [...endColumn].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) };
}

function letters(index: number): string {
  return String.fromCharCode(65 + index);
}

type ReadCell = { readonly t: unknown; readonly v: unknown; readonly note: string };

function readCell(bytes: Uint8Array, key: string): ReadCell | undefined {
  const cell = readSheet(bytes)[key];
  if (!isRecord(cell)) return undefined;
  const note = Array.isArray(cell.c) && isRecord(cell.c[0]) && typeof cell.c[0].t === 'string' ? cell.c[0].t : '';
  return { t: cell.t, v: cell.v, note };
}

function dateParts(value: unknown): { readonly y: number; readonly m: number; readonly d: number } | undefined {
  if (typeof value !== 'number') return undefined;
  const parsed: unknown = ssf().parse_date_code(value);
  if (!isRecord(parsed) || typeof parsed.y !== 'number' || typeof parsed.m !== 'number' || typeof parsed.d !== 'number') return undefined;
  return { y: parsed.y, m: parsed.m, d: parsed.d };
}

function ssf(): { parse_date_code(value: number): unknown } {
  const format = xlsx().SSF;
  if (!isRecord(format) || typeof format.parse_date_code !== 'function') throw new Error('xlsx 没有日期解码');
  const parse = format.parse_date_code;
  return { parse_date_code: (value) => parse(value) };
}

function readSheet(bytes: Uint8Array): Record<string, unknown> {
  const book = callRead(bytes);
  if (!isRecord(book) || !isRecord(book.Sheets) || !isRecord(book.Sheets['订单行'])) throw new Error('xlsx 没有订单行');
  return book.Sheets['订单行'];
}

function callRead(bytes: Uint8Array): unknown {
  const loaded = xlsx();
  if (typeof loaded.read !== 'function') throw new Error('xlsx 没有 read');
  return loaded.read(bytes, { type: 'array' });
}

function xlsx(): Record<string, unknown> {
  const loaded: unknown = createRequire(new URL('../../../packages/report-renderers/package.json', import.meta.url))('xlsx');
  if (!isRecord(loaded)) throw new Error('xlsx 没有加载');
  return loaded;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
