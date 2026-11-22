import { BatchViewSchema, DetectResponseSchema, ExportConfirmedArrivalsRequestSchema, ImportBatchSummarySchema, OrderLineDetailSchema, TodayResponseSchema } from '@sw/contracts';
import { localDate } from '@sw/domain';
import { workbookReader } from '@sw/importers';
import { partyRepository } from '@sw/persistence';
import { spreadsheetWriter } from '@sw/report-renderers';
import { expect, it } from 'vitest';
import { aParty } from '../../../packages/testkit/src/index.js';
import { must, openProcurementImport, procurementImportClient } from './helpers/procurement-import.js';
import { loginAs } from './helpers/server.js';

const BUYER = '0199f0a0-0000-7000-8000-000000000002';
const ADMIN = '0199f0a0-0000-7000-8000-000000000001';
const WAREHOUSE = '0199f0a0-0000-7000-8000-000000000010';
const PO = 'PO20260920000001';
const TEMPLATE = 'batch-confirmed-arrival-v1';
const FIRST_DATE = '2026-09-20';
const NEXT_DATE = '2026-09-24';
const MANUAL_DATE = '2026-09-25';
const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEADERS = ['要货批次ID', 'PO单号', '品名', '批次序号', '仓库', '导出时确认到货日', '采购确认到货日', '改期原因', '导出时收货方ID', '导出时订单行ID'];

it('导出同一 PO 的两个批次，提交一个确认日并回读提醒和改期历史', async () => {
  const opened = await openScenario();
  try {
    const { api, admin, a, b, lineId } = opened;
    const exportRequest = { method: 'POST' as const, url: '/api/v1/lines/bulk/confirmed-arrival.xlsx', payload: { lineIds: [lineId] } };
    expect((await api.app.inject({ ...exportRequest, headers: { cookie: await loginAs(api.app, 'reviewer') } })).statusCode).toBe(403);
    const exported = await api.app.inject({ ...exportRequest, headers: { cookie: api.cookie } });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers['content-type']).toBe(MIME);
    const rows = await workbookRows(exported.rawPayload);
    expect(rows).toEqual([
      HEADERS,
      [a, PO, '测试子件', '1', '我方仓库', '未确认', '', '', WAREHOUSE, lineId],
      [b, PO, '测试子件', '2', '我方仓库', '未确认', '', '', WAREHOUSE, lineId],
    ]);
    const file = writeWorkbook([fill(rows, { row: 1, date: FIRST_DATE }), must(rows[2])]);
    const detected = await detect(api, file);
    expect(detected.candidates[0]?.template).toBe(TEMPLATE);
    const reviewer = await loginAs(api.app, 'reviewer');
    expect((await start(api, { fileId: detected.fileId, cookie: reviewer })).statusCode).toBe(403);
    const batch = await upload(api, file);
    expect(batch.stats.byAction).toMatchObject({ update: 1, skip: 1 });
    const commit = { id: batch.id, revision: batch.revision ?? 0 };
    expect((await api.commit(commit, { cookie: reviewer })).statusCode).toBe(403);
    expect((await api.commit(commit, { cookie: admin })).statusCode).toBe(200);
    await assertDates(opened, { a: FIRST_DATE, b: null });
    const before = (await api.detail(lineId)).batches.find((item) => item.id === a);
    expect(before).toMatchObject({
      firstConfirmedDate: FIRST_DATE,
      confirmedBy: ADMIN,
      dateChanges: [{ oldValue: null, newValue: FIRST_DATE, reason: null, changedBy: ADMIN }],
    });
    const today = TodayResponseSchema.parse((await api.app.inject({ url: '/api/v1/today?scope=mine', headers: { cookie: api.cookie } })).json());
    expect(today.items.find((item) => item.refs.batchId === a)?.dueDate).toBe(FIRST_DATE);
    expect(today.items.find((item) => item.refs.batchId === a)?.reasons).not.toContain('missing_date');
    expect(today.items.find((item) => item.refs.batchId === b)?.reasons).toContain('missing_date');
    await verifyReplayAndReason(opened, { file, before: must(before) });
  } finally {
    await opened.close();
  }
});

it('冲突预览拒绝改期缺原因和同一批次不同日期，原日期不变', async () => {
  const opened = await openScenario();
  try {
    const { api, a, b } = opened;
    await patchDate(api, { id: a, date: FIRST_DATE });
    const rows = await exportRows(opened);
    const bad = await upload(api, writeWorkbook([
      fill(rows, { row: 1, date: NEXT_DATE }),
      fill(rows, { row: 2, date: NEXT_DATE }),
      fill(rows, { row: 2, date: MANUAL_DATE }),
    ]));
    expect(bad.stats.byAction.conflict).toBe(3);
    expect(bad.stats.byIssue).toMatchObject({ ARRIVAL_CONFIRM_DATE_REASON_MISSING: 1, ARRIVAL_CONFIRM_DATE_DUPLICATE: 2 });
    const committed = await api.commit({ id: bad.id, revision: bad.revision ?? 0 });
    expect(committed.statusCode).toBe(409);
    await assertDates(opened, { a: FIRST_DATE, b: null });
    expect((await api.detail(opened.lineId)).batches.find((batch) => batch.id === b)?.dateChanges).toEqual([]);
  } finally {
    await opened.close();
  }
});

it('提交时确认日已被人工修改则整批回退，旧表重新预览时提示重新导出', async () => {
  const opened = await openScenario();
  try {
    const { api, b, lineId } = opened;
    const rows = await exportRows(opened);
    const file = writeWorkbook([fill(rows, { row: 1, date: FIRST_DATE }), fill(rows, { row: 2, date: NEXT_DATE })]);
    const staged = await upload(api, file);
    expect(staged.stats.byAction.update).toBe(2);
    await patchDate(api, { id: b, date: MANUAL_DATE });
    const committed = await api.commit({ id: staged.id, revision: staged.revision ?? 0 });
    expect(committed.statusCode).toBe(409);
    expect(committed.json()).toMatchObject({ error: { details: { state: 'ARRIVAL_CONFIRM_DATE_CHANGED' } } });
    await assertDates(opened, { a: null, b: MANUAL_DATE });
    const preview = await upload(api, file);
    expect(preview.stats.byIssue.ARRIVAL_CONFIRM_DATE_CHANGED).toBe(1);
    expect((await api.detail(lineId)).batches.find((batch) => batch.id === b)?.firstConfirmedDate).toBe(MANUAL_DATE);
    const refreshed = await exportRows(opened);
    const same = await upload(api, writeWorkbook([fill(refreshed, { row: 2, date: MANUAL_DATE })]));
    expect(same.stats.byAction.unchanged).toBe(1);
    await patchDate(api, { id: b, date: NEXT_DATE, reason: '人工调整排期' });
    expect((await api.commit({ id: same.id, revision: same.revision ?? 0 })).statusCode).toBe(409);
    await assertDates(opened, { a: null, b: NEXT_DATE });
  } finally {
    await opened.close();
  }
});

it('预览后换仓时拒绝旧表并整批回退，重导后按新仓确认', async () => {
  const opened = await openScenario();
  try {
    const { api, b, lineId } = opened;
    const rows = await exportRows(opened);
    const file = writeWorkbook([fill(rows, { row: 1, date: FIRST_DATE }), fill(rows, { row: 2, date: NEXT_DATE })]);
    const staged = await upload(api, file);
    expect(staged.stats.byAction.update).toBe(2);
    const warehouse = aParty({ displayName: '测试备用仓', isSupplier: false, isFactory: false, isOwnWarehouse: true });
    await partyRepository(opened.db).save(warehouse);
    const receiverPartyId = warehouse.id;
    const patched = await api.app.inject({
      method: 'PATCH', url: `/api/v1/batches/${b}`, headers: { cookie: api.cookie }, payload: { receiverPartyId },
    });
    expect(patched.statusCode, patched.body).toBe(200);
    const committed = await api.commit({ id: staged.id, revision: staged.revision ?? 0 });
    expect(committed.statusCode).toBe(409);
    expect(committed.json()).toMatchObject({ error: { details: { state: 'ARRIVAL_BATCH_RECEIVER_CHANGED' } } });
    await assertDates(opened, { a: null, b: null });
    const preview = await upload(api, file);
    expect(preview.stats.byIssue.ARRIVAL_BATCH_RECEIVER_CHANGED).toBe(1);
    const refreshed = await exportRows(opened);
    expect(refreshed[2]?.[4]).toBe('测试备用仓');
    const current = await upload(api, writeWorkbook([fill(refreshed, { row: 2, date: NEXT_DATE })]));
    expect((await api.commit({ id: current.id, revision: current.revision ?? 0 })).statusCode).toBe(200);
    await assertDates(opened, { a: null, b: NEXT_DATE });
    expect((await api.detail(lineId)).batches.find((item) => item.id === b)?.receiverPartyId).toBe(receiverPartyId);
    const replay = await upload(api, writeWorkbook([fill(rows, { row: 2, date: NEXT_DATE })]));
    expect(replay.stats.byAction.unchanged).toBe(1);
    expect((await api.commit({ id: replay.id, revision: replay.revision ?? 0 })).statusCode).toBe(200);
  } finally {
    await opened.close();
  }
});

it('同一 PO 下误粘另一批次的 ID，预览能识别错序号和错订单行', async () => {
  const opened = await openScenario();
  try {
    const { api, b } = opened;
    const otherLineId = await makeLine(api, '另一测试子件');
    const other = await makeBatch(api, otherLineId);
    const otherRows = await exportRows({ ...opened, lineId: otherLineId });
    expect(otherRows[1]?.slice(0, 4)).toEqual([other, PO, '另一测试子件', '1']);
    const rows = await exportRows(opened);
    const [, ...row] = fill(rows, { row: 1, date: FIRST_DATE });
    const valid = fill(rows, { row: 2, date: FIRST_DATE });
    const wrong = await upload(api, writeWorkbook([valid, [b, ...row], [other, ...row]]));
    expect(wrong.stats.byIssue.ARRIVAL_BATCH_IDENTITY_CHANGED).toBe(2);
    expect((await api.commit({ id: wrong.id, revision: wrong.revision ?? 0 })).statusCode).toBe(409);
    await assertDates(opened, { a: null, b: null });
    expect((await api.detail(otherLineId)).batches[0]?.dateBuyerConfirmed).toBeNull();
  } finally {
    await opened.close();
  }
});

type Api = Awaited<ReturnType<typeof procurementImportClient>>;
type Scenario = Awaited<ReturnType<typeof openScenario>>;

async function openScenario() {
  const opened = await openProcurementImport({ isLocal: true });
  try {
    const api = await procurementImportClient(opened.app, opened.handle);
    const admin = await loginAs(api.app, 'admin');
    const lineId = await makeLine(api, '测试子件');
    const a = await makeBatch(api, lineId);
    const b = await makeBatch(api, lineId);
    return { api, admin, lineId, a, b, db: opened.handle.db, close: opened.close };
  } catch (error) {
    await opened.close();
    throw error;
  }
}

async function makeLine(api: Api, nameRaw: string) {
  const made = await api.app.inject({
    method: 'POST', url: '/api/v1/lines', headers: { cookie: api.cookie },
    payload: { lane: 'material', poRaw: PO, nameRaw, qtyOrdered: 10, unit: '个', receiverPartyId: WAREHOUSE, buyerUserId: BUYER },
  });
  expect(made.statusCode, made.body).toBe(200);
  return OrderLineDetailSchema.parse(made.json()).line.id;
}

async function makeBatch(api: Api, lineId: string) {
  const made = await api.app.inject({
    method: 'POST', url: `/api/v1/lines/${lineId}/batches`, headers: { cookie: api.cookie },
    payload: { plannedQty: 5, receiverPartyId: WAREHOUSE },
  });
  expect(made.statusCode, made.body).toBe(200);
  return BatchViewSchema.parse(made.json()).id;
}

async function detect(api: Api, file: Uint8Array) {
  const boundary = 'confirmed-arrival-fixture';
  const response = await api.app.inject({
    method: 'POST', url: '/api/v1/imports/detect', headers: { cookie: api.cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="确认日测试.xlsx"\r\nContent-Type: ${MIME}\r\n\r\n`),
      Buffer.from(file), Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  expect(response.statusCode, response.body).toBe(200);
  return DetectResponseSchema.parse(response.json());
}

function start(api: Api, input: { readonly fileId: string; readonly cookie: string }) {
  return api.app.inject({ method: 'POST', url: '/api/v1/imports', headers: { cookie: input.cookie }, payload: { fileId: input.fileId, template: TEMPLATE } });
}

async function upload(api: Api, file: Uint8Array) {
  const detected = await detect(api, file);
  const response = await start(api, { fileId: detected.fileId, cookie: api.cookie });
  expect(response.statusCode, response.body).toBe(200);
  return ImportBatchSummarySchema.parse(response.json());
}

async function exportRows({ api, lineId }: Scenario) {
  const payload = ExportConfirmedArrivalsRequestSchema.parse({ lineIds: [lineId] });
  const exported = await api.app.inject({ method: 'POST', url: '/api/v1/lines/bulk/confirmed-arrival.xlsx', headers: { cookie: api.cookie }, payload });
  expect(exported.statusCode, exported.body).toBe(200);
  return workbookRows(exported.rawPayload);
}

async function workbookRows(bytes: Uint8Array) {
  const workbook = await workbookReader().read(bytes, '采购确认到货日.xlsx');
  const sheet = must(workbook.sheets[0]);
  expect(sheet.name).toBe('采购确认到货日');
  return Array.from({ length: sheet.rowCount }, (_, row) => HEADERS.map((_, col) => sheet.cell(row + 1, col + 1)?.text ?? ''));
}

function fill(rows: readonly (readonly string[])[], input: { readonly row: number; readonly date: string; readonly reason?: string }) {
  const row = must(rows[input.row]);
  return [...row.slice(0, 6), { kind: 'date' as const, day: localDate(input.date) }, input.reason ?? '', ...row.slice(8)];
}

function writeWorkbook(rows: Parameters<ReturnType<typeof spreadsheetWriter>['write']>[0]['sheets'][number]['rows']) {
  return spreadsheetWriter().write({ sheets: [{ name: '采购确认到货日', rows: [HEADERS, ...rows] }] });
}

async function assertDates({ api, a, b, lineId }: Scenario, expected: { readonly a: string | null; readonly b: string | null }) {
  const detail = await api.detail(lineId);
  expect(detail.batches).toHaveLength(2);
  expect(detail.batches.find((item) => item.id === a)?.dateBuyerConfirmed).toBe(expected.a);
  expect(detail.batches.find((item) => item.id === b)?.dateBuyerConfirmed).toBe(expected.b);
}

async function verifyReplayAndReason(opened: Scenario, input: { readonly file: Uint8Array; readonly before: ReturnType<typeof BatchViewSchema.parse> }) {
  const { api, lineId, a } = opened;
  const replay = await upload(api, input.file);
  expect(replay.stats.byAction).toMatchObject({ unchanged: 1, skip: 1 });
  expect((await api.commit({ id: replay.id, revision: replay.revision ?? 0 })).statusCode).toBe(200);
  expect((await api.detail(lineId)).batches.find((item) => item.id === a)?.dateChanges).toEqual(input.before.dateChanges);
  const rows = await exportRows(opened);
  const next = await upload(api, writeWorkbook([fill(rows, { row: 1, date: NEXT_DATE, reason: '工厂回覆改期' })]));
  expect((await api.commit({ id: next.id, revision: next.revision ?? 0 })).statusCode).toBe(200);
  await assertDates(opened, { a: NEXT_DATE, b: null });
  expect((await api.detail(lineId)).batches.find((item) => item.id === a)).toMatchObject({
    firstConfirmedDate: FIRST_DATE,
    dateChanges: expect.arrayContaining([expect.objectContaining({ oldValue: FIRST_DATE, newValue: NEXT_DATE, reason: '工厂回覆改期', changedBy: BUYER })]),
  });
}

async function patchDate(api: Api, input: { readonly id: string; readonly date: string; readonly reason?: string }) {
  const patched = await api.app.inject({
    method: 'PATCH', url: `/api/v1/batches/${input.id}`, headers: { cookie: api.cookie },
    payload: { dateBuyerConfirmed: input.date, ...(input.reason === undefined ? {} : { reason: input.reason }) },
  });
  expect(patched.statusCode, patched.body).toBe(200);
}
