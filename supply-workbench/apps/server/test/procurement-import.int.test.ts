import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { LineSummarySchema, OrderLineRowSchema, listResponseSchema } from '@sw/contracts';
import { expect, it } from 'vitest';
import { loginAs } from './helpers/server.js';
import { workbookWithBuyer } from './helpers/procurement-buyer-workbook.js';
import { must, openProcurementImport, procurementImportClient } from './helpers/procurement-import.js';
import { verifyStoreIsolation } from './helpers/procurement-store.js';

const ORIGINAL = readFileSync(new URL('../../../fixtures/synthetic/po-master-procurement.xlsx', import.meta.url));
const requireImporter = createRequire(new URL('../../../packages/importers/package.json', import.meta.url));
const XLSX = requireImporter('xlsx');
const PROJECT = '达肤妍项目进度表';
const CAP = '99010003';
const FIRST_PO = 'PO20261117009103';
const SECOND_PO = 'PO20261117009121';
const NEW_FINISHED_PO = 'PO20261117009019';
const BUYER_C = '0199f0a0-0000-7000-8000-000000000002';
const BUYER_LITERAL_AT = '0199f0a0-0000-7000-8000-000000000003';

it('采购大表提交、重传与并发沿用盖子订单行、跟进和各版来源', async () => {
  const opened = await openProcurementImport();
  try {
    await verifyOriginal(await procurementImportClient(opened.app, opened.handle));
  } finally {
    await opened.close();
  }
}, 90_000);

it('带 @ 的采购员原文按单元格类型匹配对应账号', async () => {
  const opened = await openProcurementImport({ isLocal: true });
  try {
    await opened.handle.exec(`update users set name = '@测试采购员 C' where id = '${BUYER_LITERAL_AT}'`);
    const api = await procurementImportClient(opened.app, opened.handle);
    for (const [kind, buyerId] of [['mention', BUYER_C], ['literal', BUYER_LITERAL_AT]] as const) {
      const batch = await api.upload(`buyer-${kind}.xlsx`, workbookWithBuyer(ORIGINAL, kind));
      const preview = await api.preview(batch);
      expect(preview.componentFacts.find((fact) => fact.source.sheetName === PROJECT && fact.source.rowNo === 5)).toMatchObject({
        buyerRaw: '@测试采购员 C', poRaw: FIRST_PO, quantity: 200000,
      });
      const response = await api.commit(batch);
      expect(response.statusCode, response.body).toBe(200);
      const submitted = await api.preview(batch);
      const lineId = must(submitted.submission?.observations.find((row) => row.rowNo === 5 && row.sheetName === PROJECT)?.materialLineId);
      const detail = await api.detail(lineId);
      expect(detail.line.buyer?.id).toBe(buyerId);
      const source = detail.procurement?.sources.find(({ importBatchId }) => importBatchId === batch.id);
      expect(source?.fact.buyerRaw).toBe('@测试采购员 C');
    }
  } finally {
    await opened.close();
  }
});

it('店铺按逐行已提交 OA 和每次观察的成品引用查询同一采购事项', async () => {
  const opened = await openProcurementImport({ isLocal: true });
  try {
    const api = await procurementImportClient(opened.app, opened.handle);
    const first = await api.upload('original.xlsx', ORIGINAL);
    expect((await api.commit(first)).statusCode).toBe(200);
    await verifyStoreIsolation(api, ORIGINAL);
    const scoped = listResponseSchema(OrderLineRowSchema).parse(await api.lines('store=dafuyan'));
    const material = must(scoped.items.find((item) => item.po.poRaw === FIRST_PO));
    const finished = must(scoped.items.find((item) => item.po.poRaw === 'PO20261117009001' && item.storeProgress?.materials.some(({ id }) => id === material.id)));
    const otherStore = listResponseSchema(OrderLineRowSchema).parse(await api.lines('lane=finished&store=yiling'));
    const other = must(otherStore.items[0]);
    expect(other.po.poRaw).toBe(finished.po.poRaw);
    const query = new URLSearchParams({ store: 'dafuyan' });
    for (const id of [material.id, finished.id, other.id, 'missing-order-line']) query.append('lineIds', id);
    const selected = listResponseSchema(OrderLineRowSchema).parse(await api.lines(query.toString()));
    expect(new Set(selected.items.map(({ id }) => id))).toEqual(new Set([material.id, finished.id]));
    expect(selected.page.total).toBe(2);
    expect((await api.app.inject({ url: '/api/v1/lines?lineIds=', headers: { cookie: api.cookie } })).statusCode).toBe(400);
    expect((await api.app.inject({ url: '/api/v1/lines?lineIds=' + encodeURIComponent(finished.id) })).statusCode).toBe(401);
  } finally {
    await opened.close();
  }
}, 90_000);

async function verifyOriginal(api: Awaited<ReturnType<typeof procurementImportClient>>) {
  const original = await api.upload('original.xlsx', ORIGINAL);
  const manager = await loginAs(api.app, 'manager');
  expect((await api.commit(original, { cookie: manager })).statusCode).toBe(403);

  expect((await api.commit(original, { revision: original.revision + 1, key: 'stale-revision' })).statusCode).toBe(409);
  expect((await api.preview(original)).submission).toBeUndefined();
  expect((await api.app.inject({ url: `/api/v1/lines/procurement-component:${FIRST_PO}:${CAP}`, headers: { cookie: api.cookie } })).statusCode).toBe(404);
  expect((await api.commit(original)).statusCode).toBe(200);
  const committed = await api.preview(original);
  const capObservation = committed.submission?.observations.find((entry) => entry.rowNo === 5 && entry.sheetName === PROJECT);
  const id = must(capObservation?.materialLineId);
  const otherOa = await api.preview(original, 'XPKA(CN)9902');
  const finished = [...must(committed.submission).finished, ...must(otherOa.submission).finished];
  const finishedIds = [2, 3, 6].map((rowNo) => must(finished.find((row) => row.rowNo === rowNo)?.orderLineId));
  for (const finishedId of finishedIds) expect((await api.detail(finishedId)).procurement?.relatedLines.map((line) => line.id)).toContain(id);
  expect((await api.detail(id)).line).toMatchObject({ lane: 'material', origin: 'import_procurement_component', qtyOrdered: 200000, unit: null, buyer: { name: '测试采购员 C' } });

  expect((await api.app.inject({
    method: 'POST', url: '/api/v1/follow-ups', headers: { cookie: api.cookie },
    payload: { orderLineId: id, kind: 'note', text: '供应商下周一答复' },
  })).statusCode).toBe(200);

  const archive = must(committed.submission).observations.find((entry) => entry.sheetName === '已完结订单情况');
  const archivedId = must(archive?.materialLineId);
  const archived = await api.detail(archivedId);
  expect(archived.procurement?.sources[0]?.fact.status).toBe('completed');
  expect(archived.line).toMatchObject({ stage: 'no_batch', cancelledAt: null });
  await verifyRevisions({ api, original, id, finishedIds });
  await verifyManualAndDuplicate({ api, id });
  await verifyFinishedPoLane(api);
}

async function verifyRevisions({ api, original, id, finishedIds }: {
  readonly api: Awaited<ReturnType<typeof procurementImportClient>>;
  readonly original: { readonly id: string; readonly revision: number };
  readonly id: string;
  readonly finishedIds: readonly string[];
}) {
  const revisionA = await api.upload('revision-a.xlsx', revision({ memo: 'A' }));
  const revisionB = await api.upload('revision-b.xlsx', revision({ memo: 'B' }));
  const concurrent = await api.concurrent([() => api.commit(revisionA), () => api.commit(revisionB)]);
  expect(concurrent.map((item) => item.statusCode)).toEqual([200, 200]);
  const newFinished = await api.lines(`lane=finished&q=${NEW_FINISHED_PO}`);
  expect(newFinished).toMatchObject({ items: [{ lane: 'finished', po: { poRaw: NEW_FINISHED_PO } }] });
  await verifyOriginalScope({ api, batchId: original.id, materialId: id, finishedIds });

  expect((await api.commit(revisionA)).statusCode).toBe(200);
  const replay = await api.upload('old-copy.xlsx', ORIGINAL);
  expect((await api.commit(replay)).statusCode).toBe(200);
  expect((await api.preview(replay)).submission?.originalBatchId).toBe(original.id);

  const component = await api.detail(id);
  expect(component.line).toMatchObject({ qtyOrdered: 210000, unit: null, buyer: { name: '采购乙' }, stage: 'no_batch' });
  expect(component.followUps).toEqual([expect.objectContaining({ text: '供应商下周一答复', orderLineId: id })]);
  expect(component.procurement?.sources.map((source) => [source.fact.source.rowNo, source.fact.quantity]).sort()).toEqual([[25, 210000], [25, 210000], [5, 200000]]);
  for (const source of component.procurement?.sources ?? []) expect(new Set(source.finishedLineIds)).toEqual(new Set(finishedIds));
  for (const finishedId of finishedIds) expect((await api.detail(finishedId)).procurement?.relatedLines.filter((line) => line.poRaw === FIRST_PO)).toEqual([expect.objectContaining({ id })]);

  await verifyUnresolved({ api, revision: revisionA, id });

  const omitted = await api.upload('omitted.xlsx', revision({ memo: 'omitted', omit: true }));
  expect((await api.commit(omitted)).statusCode).toBe(200);
  const unchanged = await api.detail(id);
  expect(unchanged.line).toMatchObject({ qtyOrdered: 210000, stage: 'no_batch', cancelledAt: null, missingInLatestImport: false });
  expect(unchanged.followUps).toEqual(component.followUps);
  expect(unchanged.procurement).toEqual(component.procurement);
}

async function verifyOriginalScope({ api, batchId, materialId, finishedIds }: {
  readonly api: Awaited<ReturnType<typeof procurementImportClient>>;
  readonly batchId: string;
  readonly materialId: string;
  readonly finishedIds: readonly string[];
}) {
  const query = new URLSearchParams({ importBatchId: batchId });
  const listed = listResponseSchema(OrderLineRowSchema).parse(await api.lines(query.toString()));
  expect(listed.items.map((line) => line.id)).toEqual(expect.arrayContaining([materialId, ...finishedIds]));
  const poNumbers = listed.items.map((line) => line.po.poRaw).sort();
  expect(poNumbers).toEqual([
    'PO20261117009001', 'PO20261117009002', 'PO20261117009003', 'PO20261117009004', 'PO20261117009005',
    FIRST_PO, 'PO20261117009109', 'PO20261117009110',
  ]);

  const headers = { cookie: api.cookie };
  const summary = await api.app.inject({ url: `/api/v1/lines/summary?${query}`, headers });
  expect(summary.statusCode, summary.body).toBe(200);
  expect(LineSummarySchema.parse(summary.json()).total).toBe(listed.items.length);

  query.set('pageSize', '1');
  query.set('columns', 'po');
  const exported = await api.app.inject({ url: `/api/v1/lines/export.xlsx?${query}`, headers });
  expect(exported.statusCode).toBe(200);
  const book = XLSX.read(exported.rawPayload);
  const exportedRows: unknown[][] = XLSX.utils.sheet_to_json(book.Sheets['订单行'], { header: 1 });
  expect(exportedRows.slice(1).map((row) => row[0]).sort()).toEqual(poNumbers);
}

async function verifyManualAndDuplicate({ api, id }: { readonly api: Awaited<ReturnType<typeof procurementImportClient>>; readonly id: string }) {
  const admin = await loginAs(api.app, 'admin');
  const assigned = await api.app.inject({
    method: 'POST', url: '/api/v1/lines/bulk/assign', headers: { cookie: admin },
    payload: { lineIds: [id], buyerUserId: BUYER_C },
  });
  expect(assigned.statusCode, assigned.body).toBe(200);
  const active = await api.upload('active.xlsx', revision({ memo: 'active', qty: 215000 }));
  expect((await api.commit(active)).statusCode).toBe(200);
  const old = await api.detail(id);
  expect(old.line).toMatchObject({ qtyOrdered: 215000, buyer: { id: BUYER_C } });

  const duplicate = await api.upload('duplicate.xlsx', revision({ memo: 'duplicate', qty: 260000, duplicate: true }));
  expect((await api.commit(duplicate)).statusCode).toBe(200);
  const first = await api.preview(duplicate);
  expect(first.componentFacts.filter(({ source }) => [25, 29].includes(source.rowNo))).toMatchObject([
    { source: { rowNo: 25 }, buyerRaw: '采购乙' },
    { source: { rowNo: 29 }, buyerRaw: '测试采购员 C' },
  ]);
  expect(first.submission?.observations.filter((row) => row.rowNo === 25 || row.rowNo === 29)).toEqual(expect.arrayContaining([
    expect.objectContaining({ rowNo: 25, materialLineId: null, reasons: expect.arrayContaining(['duplicate_identity']) }),
    expect.objectContaining({ rowNo: 29, materialLineId: null, reasons: expect.arrayContaining(['duplicate_identity']) }),
  ]));
  const cleaned = await api.upload('cleaned.xlsx', revision({ memo: 'cleaned', qty: 280000 }));
  expect((await api.commit(cleaned)).statusCode).toBe(200);
  const resubmit = (await api.preview(cleaned)).submission?.observations.find((row) => row.rowNo === 25);
  expect(resubmit).toMatchObject({ materialLineId: null, reasons: ['unresolved_history'] });
  const current = await api.detail(id);
  expect(current.line).toMatchObject({ qtyOrdered: 215000, buyer: { id: BUYER_C } });
  expect(current.procurement).toEqual(old.procurement);
  expect(current.followUps).toEqual(old.followUps);
}

async function verifyFinishedPoLane(api: Awaited<ReturnType<typeof procurementImportClient>>) {
  const book = XLSX.read(ORIGINAL);
  const name = '采购订单总表';
  const sheet = book.Sheets[name];
  sheet.I5 = { t: 's', v: FIRST_PO };
  book.SheetNames = [name];
  const batch = await api.upload('finished-only.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  const response = await api.commit(batch);
  expect(response.statusCode, response.body).toBe(200);
  const lines = await api.lines(`lane=finished&q=${FIRST_PO}`);
  expect(lines).toMatchObject({ items: [{ lane: 'finished', po: { poRaw: FIRST_PO } }] });
}

async function verifyUnresolved({ api, revision, id }: {
  readonly api: Awaited<ReturnType<typeof procurementImportClient>>;
  readonly revision: { readonly id: string };
  readonly id: string;
}) {
  const next = await api.preview(revision);
  const candidate = await api.preview(revision, 'XPKA(CN)9910');
  expect(candidate.links).toEqual([expect.objectContaining({ kind: 'candidate', component: { sheetName: PROJECT, rowNo: 30 } })]);
  expect(candidate.submission?.observations).toEqual([expect.objectContaining({ rowNo: 30, materialLineId: null, reasons: ['no_confirmed_finished_line'] })]);
  const second = next.componentFacts.find((fact) => fact.poRaw === SECOND_PO);
  expect(second?.componentCodeRaw).toBe(CAP);
  const secondId = must(next.submission?.observations.find((entry) => entry.rowNo === 26 && entry.sheetName === PROJECT)?.materialLineId);
  expect(secondId).not.toBe(id);
  expect((await api.detail(secondId)).line).toMatchObject({ qtyOrdered: 12000, buyer: null, supplier: { rawName: null } });
  const reasons = next.submission?.observations.filter((entry) => entry.rowNo >= 3 && entry.sheetName === PROJECT);
  expect(reasons).toEqual(expect.arrayContaining([
    expect.objectContaining({ rowNo: 3, materialLineId: null, reasons: ['no_confirmed_finished_line'] }),
    expect.objectContaining({ rowNo: 27, materialLineId: null, reasons: expect.arrayContaining(['invalid_component_code']) }),
    expect.objectContaining({ rowNo: 28, materialLineId: null, reasons: expect.arrayContaining(['missing_po']) }),
  ]));
}

function revision({ memo, omit = false, duplicate = false, qty = 210000 }: { readonly memo: string; readonly omit?: boolean; readonly duplicate?: boolean; readonly qty?: number }): Buffer {
  const book = XLSX.read(ORIGINAL);
  addFinishedRow(book.Sheets['采购订单总表']);
  const sheet = book.Sheets[PROJECT];
  flattenComponentMerges(sheet);
  moveSourceRows(sheet, duplicate ? [25, 26, 27, 28, 29, 30] : [25, 26, 27, 28, 30]);
  sheet.M25 = { t: 'n', v: qty };
  sheet.I25 = { t: 's', v: '采购乙' };
  if (duplicate) sheet.I29 = { t: 's', v: '测试采购员 C' };
  sheet.R25 = { t: 's', v: memo };
  sheet.K26 = { t: 's', v: SECOND_PO };
  sheet.M26 = { t: 'n', v: 12000 };
  delete sheet.I26;
  delete sheet.J26;
  sheet.K27 = { t: 's', v: 'PO20261117009122' };
  delete sheet.H27;
  sheet.H28 = { t: 's', v: '99010023' };
  delete sheet.K28;
  if (omit) removeSourceRow(sheet, 25);
  addCandidateComponent(sheet);
  sheet['!ref'] = 'A1:R30';
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

function addCandidateComponent(sheet: Record<string, unknown>) {
  delete sheet.A30;
  sheet.C30 = { t: 's', v: '9900000000088' };
  sheet.H30 = { t: 's', v: '99010029' };
  sheet.K30 = { t: 's', v: 'PO20261117009129' };
}

function addFinishedRow(sheet: Record<string, unknown>) {
  copySourceRow({ sheet, from: 2, to: 9 });
  sheet.A9 = { t: 's', v: 'XPKA(CN)9910' };
  sheet.D9 = { t: 's', v: '9900000000088' };
  sheet.I9 = { t: 's', v: NEW_FINISHED_PO };
  sheet['!ref'] = 'A1:R9';
}

function moveSourceRows(sheet: Record<string, unknown>, targets: readonly number[]) {
  for (const target of targets) copySourceRow({ sheet, from: 5, to: target });
  removeSourceRow(sheet, 5);
}

function copySourceRow({ sheet, from, to }: { readonly sheet: Record<string, unknown>; readonly from: number; readonly to: number }) {
  for (let col = 0; col < 18; col += 1) {
    const old = sheet[XLSX.utils.encode_cell({ r: from - 1, c: col })];
    if (typeof old === 'object' && old !== null) sheet[XLSX.utils.encode_cell({ r: to - 1, c: col })] = { ...old };
  }
}

function removeSourceRow(sheet: Record<string, unknown>, row: number) {
  for (let col = 0; col < 18; col += 1) delete sheet[XLSX.utils.encode_cell({ r: row - 1, c: col })];
}

function flattenComponentMerges(sheet: Record<string, unknown>) {
  const merges = sheet['!merges'];
  if (!Array.isArray(merges)) throw new Error('夹具缺少合并格');
  for (const { s, e } of merges.slice(1)) {
    const anchor = sheet[XLSX.utils.encode_cell(s)];
    if (typeof anchor !== 'object' || anchor === null) throw new Error('夹具缺少合并格原值');
    for (let row = s.r; row <= e.r; row += 1) {
      for (let col = s.c; col <= e.c; col += 1) sheet[XLSX.utils.encode_cell({ r: row, c: col })] = { ...anchor };
    }
  }
  sheet['!merges'] = merges.slice(0, 1);
}
