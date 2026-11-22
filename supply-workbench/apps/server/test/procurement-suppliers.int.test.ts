import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { BatchViewSchema, listResponseSchema, OrderLineRowSchema, PartyAliasViewSchema, TodayResponseSchema } from '@sw/contracts';
import { expect, it } from 'vitest';
import { must, openProcurementImport, procurementImportClient } from './helpers/procurement-import.js';
import { loginAs } from './helpers/server.js';

const XLSX = createRequire(new URL('../../../packages/importers/package.json', import.meta.url))('xlsx');
const PROJECT = '达肤妍项目进度表';
const ORIGINAL = procurementWithUnit();
const COMPONENT_SUPPLIER = '测试供应商 D';
const ARCHIVE_SUPPLIER = '测试供应商 H';
const DISPLAY_NAME = '测试盖子工厂';
const NEW_FINISHED_PO = 'PO20261117009200';
const OLD_MATERIAL_PO = 'PO20261117009103';
const NEW_MATERIAL_PO = 'PO20261117009203';
const NEW_REJECTED_PO = 'PO20261117009209';
const WAREHOUSE_ID = '0199f0a0-0000-7000-8000-000000000010';

type Api = Awaited<ReturnType<typeof procurementImportClient>>;

it('采购子件待审核供应商回填今日分组，后续成品和子件采购单复用已审核别名', async () => {
  const { app, handle, close } = await openProcurementImport();
  try {
    const api = await procurementImportClient(app, handle);
    const reviewer = await loginAs(app, 'reviewer');
    const original = await api.upload('supplier-original.xlsx', ORIGINAL);
    expect((await api.commit(original)).statusCode).toBe(200);
    const { component, rejected } = await verifyPending({ api, reviewer });
    const line = await lineForPo({ api, lane: 'material', po: OLD_MATERIAL_PO });
    expect(line.supplier).toMatchObject({ id: null, rawName: COMPONENT_SUPPLIER });
    const batchId = await createDeliveryBatch({ api, lineId: line.id });
    expect((await todayBatch({ api, batchId }))?.waitingOn).toEqual({ kind: 'supplier', partyId: null });

    const partyId = await reviewSuppliers({ api, reviewer, component, rejected });
    expect((await todayBatch({ api, batchId }))?.waitingOnParty).toMatchObject({ id: partyId, displayName: DISPLAY_NAME });
    expect((await api.detail(line.id)).line.supplier).toMatchObject({ id: partyId, rawName: COMPONENT_SUPPLIER });
    await verifyLaterImport({ api, partyId });

    const replay = await api.upload('supplier-original-copy.xlsx', ORIGINAL);
    expect((await api.commit(replay)).statusCode).toBe(200);
    expect((await api.preview(replay)).submission?.originalBatchId).toBe(original.id);
    expect((await api.detail(line.id)).procurement?.sources).toHaveLength(1);
    const counts = await handle.exec(`select seen_count, seen_batch_count from party_aliases where norm_name = '${COMPONENT_SUPPLIER}'`);
    expect(Array.isArray(counts) ? counts[0] : counts).toMatchObject({ rows: [{ seen_count: 3, seen_batch_count: 2 }] });
  } finally {
    await close();
  }
}, 90_000);

it('同一采购单的已审批别名同时支持跨批更新和同批的不同子件', async () => {
  const { app, handle, close } = await openProcurementImport({ isLocal: true });
  try {
    const api = await procurementImportClient(app, handle);
    const first = await api.upload('supplier-original.xlsx', ORIGINAL);
    expect((await api.commit(first)).statusCode).toBe(200);
    const id = must((await api.preview(first)).submission?.observations.find((row) => row.rowNo === 5 && row.sheetName === PROJECT)?.materialLineId);
    const reviewer = await loginAs(app, 'reviewer');
    const { component, rejected: alternate } = await verifyPending({ api, reviewer });
    const partyId = await approveSupplier({ api, reviewer, alias: component, payload: { createParty: { displayName: DISPLAY_NAME, isSupplier: true, isFactory: true } } });
    await approveSupplier({ api, reviewer, alias: alternate, payload: { partyId } });

    const book = XLSX.read(ORIGINAL);
    const project = book.Sheets[PROJECT];
    project.J5 = { t: 's', v: ARCHIVE_SUPPLIER };
    project.M5 = { t: 's', v: '210000个' };
    project.G6 = { t: 's', v: '测试共用泵头' };
    project.J6 = { t: 's', v: COMPONENT_SUPPLIER };
    project.K6 = { t: 's', v: OLD_MATERIAL_PO };
    const revision = await api.upload('supplier-alternate.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
    expect((await api.commit(revision)).statusCode).toBe(200);
    const result = await api.preview(revision);
    expect(result.submission?.observations.find((row) => row.rowNo === 5 && row.sheetName === PROJECT)).toMatchObject({ materialLineId: id, reasons: [] });
    const other = must(result.submission?.observations.find((row) => row.rowNo === 6 && row.sheetName === PROJECT)?.materialLineId);
    expect(other).not.toBe(id);
    expect((await api.detail(id)).line).toMatchObject({ qtyOrdered: 210000, supplier: { id: partyId } });
    expect((await api.detail(other)).line.supplier).toMatchObject({ id: partyId });
  } finally {
    await close();
  }
});

it('冲突采购单位待核，保留既有采购量并允许后来修正', async () => {
  const { app, handle, close } = await openProcurementImport({ isLocal: true });
  try {
    const api = await procurementImportClient(app, handle);
    const first = await api.upload('unit-original.xlsx', ORIGINAL);
    expect((await api.commit(first)).statusCode).toBe(200);
    const line = await lineForPo({ api, lane: 'material', po: OLD_MATERIAL_PO });
    const book = XLSX.read(ORIGINAL);
    const project = book.Sheets[PROJECT];
    project.S2 = { t: 's', v: '采购单位' };
    project.S5 = { t: 's', v: '箱' };
    project.M5 = { t: 's', v: '21万 个' };
    project['!ref'] = 'A1:S9';
    const conflicted = await api.upload('unit-conflict.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
    expect((await api.preview(conflicted)).componentFacts.find((fact) => fact.source.rowNo === 5)).toMatchObject({
      quantity: null, quantityRaw: '21万 个', unitRaw: '箱', quantityUnitConflict: true,
    });
    expect((await api.commit(conflicted)).statusCode).toBe(200);
    expect((await api.preview(conflicted)).submission?.observations.find((row) => row.rowNo === 5 && row.sheetName === PROJECT)).toMatchObject({
      materialLineId: null, reasons: ['quantity_unit_conflict'],
    });
    expect((await api.detail(line.id)).line).toMatchObject({ qtyOrdered: 200000, unit: '个' });

    project.S5 = { t: 's', v: '个' };
    const corrected = await api.upload('unit-confirmed.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
    expect((await api.commit(corrected)).statusCode).toBe(200);
    expect((await api.detail(line.id)).line).toMatchObject({ qtyOrdered: 210000, unit: '个' });
  } finally {
    await close();
  }
});

async function approveSupplier({ api, reviewer, alias, payload }: {
  readonly api: Api;
  readonly reviewer: string;
  readonly alias: string;
  readonly payload: { readonly partyId: string } | { readonly createParty: { readonly displayName: string; readonly isSupplier: boolean; readonly isFactory: boolean } };
}) {
  const response = await api.app.inject({ method: 'POST', url: `/api/v1/master/aliases/${encodeURIComponent(alias)}/approve`, headers: { cookie: reviewer }, payload });
  expect(response.statusCode, response.body).toBe(200);
  return must(PartyAliasViewSchema.parse(response.json()).partyId);
}

async function verifyPending({ api, reviewer }: { readonly api: Api; readonly reviewer: string }) {
  const response = await api.app.inject({ url: '/api/v1/master/aliases?status=pending&pageSize=200', headers: { cookie: reviewer } });
  expect(response.statusCode, response.body).toBe(200);
  const { items } = listResponseSchema(PartyAliasViewSchema).parse(response.json());
  expect(items.map((item) => item.rawName)).toEqual(expect.arrayContaining([COMPONENT_SUPPLIER, ARCHIVE_SUPPLIER, '测试成品供应商 A']));
  for (const name of ['测试供应商 E', '测试供应商 F', '测试供应商 G']) {
    expect(items.some((item) => item.rawName === name)).toBe(false);
  }
  const component = must(items.find((item) => item.rawName === COMPONENT_SUPPLIER));
  const rejected = must(items.find((item) => item.rawName === ARCHIVE_SUPPLIER));
  expect(component.seenCount).toBe(1);
  return { component: component.id, rejected: rejected.id };
}

async function reviewSuppliers({ api, reviewer, component, rejected }: { readonly api: Api; readonly reviewer: string; readonly component: string; readonly rejected: string }) {
  const headers = { cookie: reviewer };
  const partyId = await approveSupplier({ api, reviewer, alias: component, payload: { createParty: { displayName: DISPLAY_NAME, isSupplier: true, isFactory: true } } });
  const reject = await api.app.inject({ method: 'POST', url: `/api/v1/master/aliases/${encodeURIComponent(rejected)}/reject`, headers, payload: { reason: '不使用这个名称' } });
  expect(reject.statusCode, reject.body).toBe(200);
  return partyId;
}

async function lineForPo({ api, lane, po }: { readonly api: Api; readonly lane: 'finished' | 'material'; readonly po: string }) {
  const { items } = listResponseSchema(OrderLineRowSchema).parse(await api.lines(`lane=${lane}&q=${po}`));
  expect(items).toHaveLength(1);
  return must(items[0]);
}

async function createDeliveryBatch({ api, lineId }: { readonly api: Api; readonly lineId: string }) {
  const batch = await api.app.inject({ method: 'POST', url: `/api/v1/lines/${encodeURIComponent(lineId)}/batches`, headers: { cookie: api.cookie }, payload: { plannedQty: 10, receiverPartyId: WAREHOUSE_ID, dateBuyerConfirmed: '2026-11-01' } });
  expect(batch.statusCode, batch.body).toBe(200);
  return BatchViewSchema.parse(batch.json()).id;
}

async function todayBatch({ api, batchId }: { readonly api: Api; readonly batchId: string }) {
  const result = await api.app.inject({ url: '/api/v1/today?scope=all', headers: { cookie: api.cookie } });
  expect(result.statusCode, result.body).toBe(200);
  return TodayResponseSchema.parse(result.json()).items.find((item) => item.refs.batchId === batchId);
}

async function verifyLaterImport({ api, partyId }: { readonly api: Api; readonly partyId: string }) {
  const book = XLSX.read(ORIGINAL);
  const master = book.Sheets['采购订单总表'];
  const project = book.Sheets[PROJECT];
  master.I2 = { t: 's', v: NEW_FINISHED_PO };
  master.B2 = { t: 's', v: COMPONENT_SUPPLIER };
  project.K5 = { t: 's', v: NEW_MATERIAL_PO };
  project.J5 = { t: 's', v: '测试供应商 Ｄ' };
  book.Sheets['已完结订单情况'].K2 = { t: 's', v: NEW_REJECTED_PO };
  const revision = await api.upload('supplier-revision.xlsx', XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
  const response = await api.commit(revision);
  expect(response.statusCode, response.body).toBe(200);

  const finished = await lineForPo({ api, lane: 'finished', po: NEW_FINISHED_PO });
  expect(finished.supplier).toMatchObject({ id: partyId, rawName: COMPONENT_SUPPLIER });
  const material = await lineForPo({ api, lane: 'material', po: NEW_MATERIAL_PO });
  expect(material.supplier).toMatchObject({ id: partyId, rawName: '测试供应商 Ｄ' });
  const rejected = await lineForPo({ api, lane: 'material', po: NEW_REJECTED_PO });
  expect(rejected.supplier).toMatchObject({ id: null, rawName: ARCHIVE_SUPPLIER });
  const batchId = await createDeliveryBatch({ api, lineId: material.id });
  expect((await todayBatch({ api, batchId }))?.waitingOn).toEqual({ kind: 'supplier', partyId });
}

function procurementWithUnit(): Buffer {
  const fixture = readFileSync(new URL('../../../fixtures/synthetic/po-master-procurement.xlsx', import.meta.url));
  const book = XLSX.read(fixture);
  book.Sheets[PROJECT].M5 = { t: 's', v: '200000个' };
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}
