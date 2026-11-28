import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { BatchViewSchema, OrderLineDetailSchema, ShipmentViewSchema } from '@sw/contracts';
import { schema, type AppDatabase } from '@sw/persistence';
import { must, openProcurementImport, procurementImportClient } from './helpers/procurement-import.js';
import { loginAs } from './helpers/server.js';

const buyerId = '0199f0a0-0000-7000-8000-000000000002';
const warehouse = '0199f0a0-0000-7000-8000-000000000010';
const at = '2026-11-25T00:00:00.000Z';
const stamp = { createdAt: at, updatedAt: at };

it('原表回查保留采购行、工厂需求原列与已采纳出货的历史来源', async () => {
  const { app, handle, close } = await openProcurementImport({ isLocal: true });
  try {
    const client = await procurementImportClient(app, handle);
    const workbook = new URL('../../../fixtures/synthetic/po-master-procurement.xlsx', import.meta.url);
    const imported = await client.upload('采购合成.xlsx', await readFile(workbook));
    const committed = await client.commit(imported);
    expect(committed.statusCode, committed.body).toBe(200);

    const component = 'procurement-component:PO20261117009103:99010003';
    const detail = await client.detail(component);
    expect(detail.procurement?.sources).toEqual(expect.arrayContaining([expect.objectContaining({
      fileName: '采购合成.xlsx', fact: expect.objectContaining({ source: { sheetName: '达肤妍项目进度表', rowNo: 5 }, poRaw: 'PO20261117009103' }),
    })]));
    const first = await createBatch({ client, lineId: component, date: '2026-11-24' });
    const second = await createBatch({ client, lineId: component, date: '2026-11-27' });
    await insertSources(handle.db, component);

    const adoptedResponse = await app.inject({ method: 'POST', url: '/api/v1/factory-reports/shipment-rows/historical-shipment/adopt',
      headers: { cookie: client.cookie }, payload: { batchId: second.id } });
    expect(adoptedResponse.statusCode, adoptedResponse.body).toBe(200);
    const adopted = ShipmentViewSchema.parse(adoptedResponse.json());

    const read = await client.detail(component);
    expect(read.sourceFiles).toMatchObject({ 'factory-active': '工厂当前.xlsx', 'factory-history': '工厂历史.xlsx' });
    expect(read.factoryReports.demand.find(({ id }) => id === 'material-demand')).toMatchObject({ sheetName: '09月排产包材原料需求表', rowNo: 4, payload: {
      slots: [{ sourceColumns: { date: 10, quantity: 11 }, qtyRaw: '50' }, { sourceColumns: { date: 12, quantity: 13 }, qtyRaw: '100' }],
    } });
    expect(Object.fromEntries(read.factoryReports.demand.map(({ id, originalCells }) => [id, originalCells?.blockOrderRaw]))).toEqual({
      'material-demand': undefined, 'demand-order-blank': null, 'demand-order-original': '非 PO 分组',
    });
    expect(read.factoryReports.inTransit.find(({ id }) => id === 'legacy-transit')).toMatchObject({
      originalCells: {}, payload: { qtyRequired: { value: 10 }, qtyDeliveredFactory: { value: 5 } },
    });
    expect(read.factoryReports.inTransit.find(({ id }) => id === 'recorded-transit')).toMatchObject({
      originalCells: { nameRaw: null, qtyRequired: '020.0' }, payload: { qtyRequired: { value: 20 } },
    });
    expect(read.factoryReports.shipments.map(({ id }) => id)).toEqual(['current-shipment']);
    expect(read.factoryReports.shipments[0]?.payload.shipOrArriveOn).toEqual({ raw: '预计9/10', value: null });
    expect(read.factoryReports.shipments[0]?.originalCells).toEqual({ itemCodeRaw: null, qty: '020.00', shipOrArriveOn: '预计9/10' });
    expect(read.archivedShipmentSources).toMatchObject([{ id: 'historical-shipment', rowNo: 8, payload: {
      lotRaw: { value: 'LOT-HISTORY' }, qty: { value: 10 }, shipOrArriveOn: { value: '2026-11-24' },
    } }]);
    expect(read.archivedShipmentSources?.[0]?.originalCells).toEqual({});
    expect(must(read.batches.find(({ id }) => id === first.id)).shipments).toEqual([]);
    expect(must(read.batches.find(({ id }) => id === second.id)).shipments).toMatchObject([{ factoryShipmentRowId: 'historical-shipment' }]);

    await handle.exec("update shipments set created_at = '2020-01-01T00:00:00Z' where factory_shipment_row_id = 'historical-shipment'");
    const voided = await app.inject({ method: 'POST', url: `/api/v1/shipments/${adopted.id}/void`,
      headers: { cookie: client.cookie }, payload: { reason: '合成测试作废旧归属' } });
    expect(voided.statusCode, voided.body).toBe(200);
    expect((await client.detail(component)).archivedShipmentSources).toEqual([]);
  } finally {
    await close();
  }
});

it('已采纳出货重挂后仅提示原批次暂无法核对，发货数量和原表访问范围保持', async () => {
  const { app, handle, close } = await openProcurementImport({ isLocal: true });
  try {
    const client = await procurementImportClient(app, handle);
    const workbook = new URL('../../../fixtures/synthetic/po-master-procurement.xlsx', import.meta.url);
    const imported = await client.upload('采购合成.xlsx', await readFile(workbook));
    const committed = await client.commit(imported);
    expect(committed.statusCode, committed.body).toBe(200);
    const component = 'procurement-component:PO20261117009103:99010003';
    const preview = await client.preview(imported);
    const otherLine = must(preview.submission?.finished.find((row) => row.rowNo === 2)?.orderLineId);
    const first = await createBatch({ client, lineId: component, date: '2026-11-24' });
    const second = await createBatch({ client, lineId: component, date: '2026-11-27' });
    await insertSources(handle.db, component);

    const adoption = await app.inject({ method: 'POST', url: '/api/v1/factory-reports/shipment-rows/historical-shipment/adopt',
      headers: { cookie: client.cookie }, payload: { batchId: second.id } });
    expect(adoption.statusCode, adoption.body).toBe(200);
    const adopted = ShipmentViewSchema.parse(adoption.json());
    const before = await client.detail(component, 'dafuyan');
    expect(before.archivedShipmentSources?.map(({ id }) => id)).toEqual(['historical-shipment']);
    expect(before.batches.find(({ id }) => id === second.id)).not.toHaveProperty('hasUnavailableShipmentSource');

    const reviewer = await loginAs(app, 'reviewer');
    const relinked = await app.inject({ method: 'POST', url: '/api/v1/factory-reports/shipment/historical-shipment/link',
      headers: { cookie: reviewer }, payload: { orderLineId: otherLine } });
    expect(relinked.statusCode, relinked.body).toBe(200);
    const manager = await loginAs(app, 'manager');
    const managerRead = (store: string) => app.inject({ url: `/api/v1/lines/${encodeURIComponent(component)}?store=${store}`, headers: { cookie: manager } });
    const response = await managerRead('dafuyan');
    expect(response.statusCode, response.body).toBe(200);
    const after = OrderLineDetailSchema.parse(response.json());
    expect(after.batches.find(({ id }) => id === first.id)).not.toHaveProperty('hasUnavailableShipmentSource');
    expect(after.batches.find(({ id }) => id === second.id)).toMatchObject({ hasUnavailableShipmentSource: true, shippedQty: 10,
      fulfillment: { verifiedShippedQty: 0 }, shipments: [{ ...adopted, factoryShipmentRowId: null }] });
    expect(after.archivedShipmentSources).toEqual([]);
    expect(response.body).not.toContain('historical-shipment');
    expect(response.body).not.toContain('factory-history');
    expect(response.body).not.toContain('工厂历史.xlsx');
    expect((await managerRead('yiling')).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/v1/imports/factory-history', headers: { cookie: manager } })).statusCode).toBe(403);

    await handle.exec("update shipments set created_at = '2020-01-01T00:00:00Z' where factory_shipment_row_id = 'historical-shipment'");
    const voided = await app.inject({ method: 'POST', url: `/api/v1/shipments/${adopted.id}/void`,
      headers: { cookie: client.cookie }, payload: { reason: '合成测试作废旧归属' } });
    expect(voided.statusCode, voided.body).toBe(200);
    const detail = await client.detail(component, 'dafuyan');
    expect(detail.batches.find(({ id }) => id === second.id)).not.toHaveProperty('hasUnavailableShipmentSource');
  } finally {
    await close();
  }
});

it('生成的两批各自回查原需求，换表时保留，挂接其他订单后收起原稿', async () => {
  const { app, handle, close } = await openProcurementImport({ isLocal: true });
  try {
    const client = await procurementImportClient(app, handle);
    await insertFactoryImports(handle.db, [{ batch: 'factory-original', name: '需求原表.xlsx' }]);
    await handle.db.insert(schema.factoryMaterialDemandRows).values({
      ...stamp, id: 'origin-row', importBatchId: 'factory-original', factoryPartyId: factory, sheetName: demandSheet,
      rowNo: 4, fingerprint: 'original-demand', linkStatus: 'unlinked', role: 'material',
      blockMaterialPoRaw: 'PO20261117009104', itemCodeRaw: '99010004', nameRaw: '合成包材',
      slots: { slots }, raw: { slots },
    });

    const generated = await app.inject({ method: 'POST', url: '/api/v1/factory-reports/demand-rows/generate-batches',
      headers: { cookie: client.cookie }, payload: { rowIds: ['origin-row'] } });
    expect(generated.statusCode, generated.body).toBe(200);
    expect(generated.json()).toEqual({ createdLines: 1, createdBatches: 2, skipped: [] });
    const line = must((await handle.db.select().from(schema.orderLines)).find(({ itemCodeRaw }) => itemCodeRaw === '99010004'));
    const before = await client.detail(line.id);
    const first = must(before.batches.find(({ seq }) => seq === 1));
    const second = must(before.batches.find(({ seq }) => seq === 2));
    expect(first.originRef).toEqual({ rowId: 'origin-row', slotIndex: 0 });
    expect(second.originRef).toEqual({ rowId: 'origin-row', slotIndex: 1 });
    expect(before.factoryReports.demand).toEqual([]);

    await handle.exec("update import_batches set superseded_at = now() where id = 'factory-original'");
    await insertFactoryImports(handle.db, [{ batch: 'factory-replacement', name: '需求换表.xlsx' }]);
    const replacement = { index: 1, date: '2026-11-30', dateRaw: '2026-11-30', qty: 777, qtyRaw: '777', sourceColumns: { date: 18, quantity: 19 } };
    await handle.db.insert(schema.factoryMaterialDemandRows).values({
      ...stamp, id: 'replacement-row', importBatchId: 'factory-replacement', factoryPartyId: factory, sheetName: demandSheet,
      rowNo: 6, fingerprint: 'replacement-demand', linkedOrderLineId: line.id, linkStatus: 'manual', role: 'material',
      slots: { slots: [replacement] }, raw: { slots: [replacement] },
    });
    const after = await client.detail(line.id);
    expect(after.factoryReports.demand).toMatchObject([{ id: 'replacement-row', payload: { slots: [replacement] } }]);
    const expected = Object.fromEntries([first, second].map(({ id, seq }) => {
      const { index, dateRaw, qtyRaw, sourceColumns } = must(slots[seq - 1]);
      return [id, { importBatchId: 'factory-original', sheetName: demandSheet, rowNo: 4, slot: { index, dateRaw, qtyRaw, sourceColumns, originalCells: { dateRaw, qtyRaw } } }];
    }));
    expect(before.batchDemandSources).toEqual(expected);
    expect(after.batchDemandSources).toEqual(expected);
    expect(after.sourceFiles).toMatchObject({ 'factory-original': '需求原表.xlsx', 'factory-replacement': '需求换表.xlsx' });

    const otherLine = await app.inject({ method: 'POST', url: '/api/v1/lines', headers: { cookie: client.cookie },
      payload: { lane: 'material', nameRaw: '合成的另一订单行', qtyOrdered: 100, receiverPartyId: warehouse } });
    expect(otherLine.statusCode, otherLine.body).toBe(200);
    const otherLineId = OrderLineDetailSchema.parse(otherLine.json()).line.id;
    const reviewer = await loginAs(app, 'reviewer');
    const link = (orderLineId: string, cookie: string) => app.inject({ method: 'POST', url: '/api/v1/factory-reports/demand/origin-row/link',
      headers: { cookie }, payload: { orderLineId } });
    const sameLineLink = await link(line.id, reviewer);
    expect(sameLineLink.statusCode, sameLineLink.body).toBe(200);
    expect((await client.detail(line.id)).batchDemandSources).toEqual(expected);
    await handle.exec("update factory_material_demand_rows set link_status = 'unlinked', link_reason = 'NO_CANDIDATE_LINE' where id = 'origin-row'");
    const uncertain = await client.detail(line.id);
    expect(uncertain.batches).toEqual(after.batches);
    expect(uncertain.batchDemandSources).toEqual({});
    expect(uncertain.sourceFiles).toEqual({ 'factory-replacement': '需求换表.xlsx' });
    await handle.exec("update factory_material_demand_rows set link_status = 'manual', link_reason = null where id = 'origin-row'");
    expect((await link(otherLineId, client.cookie)).statusCode).toBe(403);
    const relinked = await link(otherLineId, reviewer);
    expect(relinked.statusCode, relinked.body).toBe(200);
    const relinkedDetail = await client.detail(line.id);
    expect(relinkedDetail.batches).toEqual(after.batches);
    expect(relinkedDetail.factoryReports.demand).toEqual(after.factoryReports.demand);
    expect(relinkedDetail.batchDemandSources).toEqual({});
    expect(relinkedDetail.sourceFiles).toEqual({ 'factory-replacement': '需求换表.xlsx' });

    await handle.exec("update factory_material_demand_rows set linked_order_line_id = null, link_status = 'unlinked', link_reason = 'LINE_LINK_IS_MANUAL' where id = 'origin-row'");
    const detached = await client.detail(line.id);
    expect(detached.batches).toEqual(after.batches);
    expect(detached.batchDemandSources).toEqual({});
    expect(detached.sourceFiles).toEqual({ 'factory-replacement': '需求换表.xlsx' });
  } finally {
    await close();
  }
});

it('旧工厂需求保留批次数量与日期，逐格区分缺原值和已采集空值', async () => {
  const { app, handle, close } = await openProcurementImport({ isLocal: true });
  try {
    const client = await procurementImportClient(app, handle);
    await insertFactoryImports(handle.db, [{ batch: 'factory-legacy', name: '旧需求原表.xlsx' }]);
    const legacySlots = [
      { index: 0, date: '2026-11-24', qty: 50 },
      { index: 1, date: '2026-11-27', dateRaw: null, qty: 100, qtyRaw: '0100.00' },
      { index: 2, date: null, dateRaw: null, qty: 5, qtyRaw: '5' },
    ];
    await handle.db.insert(schema.factoryMaterialDemandRows).values({
      ...stamp, id: 'legacy-origin', importBatchId: 'factory-legacy', factoryPartyId: factory, sheetName: demandSheet,
      rowNo: 4, fingerprint: 'legacy-demand', linkStatus: 'unlinked', role: 'material',
      blockMaterialPoRaw: 'PO20261117009105', itemCodeRaw: '99010005', nameRaw: '合成旧需求包材',
      slots: { slots: legacySlots.map(({ index, date, qty }) => ({ index, date, qty })) }, raw: { slots: legacySlots },
    });
    const generated = await app.inject({ method: 'POST', url: '/api/v1/factory-reports/demand-rows/generate-batches',
      headers: { cookie: client.cookie }, payload: { rowIds: ['legacy-origin'] } });
    expect(generated.statusCode, generated.body).toBe(200);
    expect(generated.json()).toEqual({ createdLines: 1, createdBatches: 2, skipped: [] });
    const line = must((await handle.db.select().from(schema.orderLines)).find(({ itemCodeRaw }) => itemCodeRaw === '99010005'));
    const detail = await client.detail(line.id);
    expect(detail.batches).toMatchObject([
      { plannedQty: 50, dateFactoryRequired: '2026-11-24', originRef: { rowId: 'legacy-origin', slotIndex: 0 } },
      { plannedQty: 100, dateFactoryRequired: '2026-11-27', originRef: { rowId: 'legacy-origin', slotIndex: 1 } },
    ]);
    const partial = must(detail.batches[1]);
    expect(detail.batchDemandSources).toEqual({ [partial.id]: {
      importBatchId: 'factory-legacy', sheetName: demandSheet, rowNo: 4,
      slot: { index: 1, dateRaw: null, qtyRaw: '0100.00', originalCells: { qtyRaw: '0100.00' } },
    } });
    expect(detail.sourceFiles).toEqual({ 'factory-legacy': '旧需求原表.xlsx' });

    const reviewer = await loginAs(app, 'reviewer');
    const linked = await app.inject({ method: 'POST', url: '/api/v1/factory-reports/demand/legacy-origin/link',
      headers: { cookie: reviewer }, payload: { orderLineId: line.id } });
    expect(linked.statusCode, linked.body).toBe(200);
    const referenced = await client.detail(line.id);
    expect(referenced.factoryReports.demand[0]?.payload.slots.map(({ originalCells }) => originalCells)).toEqual([
      {}, { qtyRaw: '0100.00' }, { dateRaw: null, qtyRaw: '5' },
    ]);
  } finally {
    await close();
  }
});

async function createBatch({ client, lineId, date }: { readonly client: Awaited<ReturnType<typeof procurementImportClient>>; readonly lineId: string; readonly date: string }) {
  const response = await client.app.inject({ method: 'POST', url: `/api/v1/lines/${encodeURIComponent(lineId)}/batches`,
    headers: { cookie: client.cookie }, payload: { plannedQty: 100, receiverPartyId: warehouse, dateBuyerConfirmed: date } });
  expect(response.statusCode, response.body).toBe(200);
  return BatchViewSchema.parse(response.json());
}

const factory = 'source-factory';
const demandSheet = '09月排产包材原料需求表';
const slots = [
  { index: 0, date: '2026-11-24', dateRaw: '2026-11-24', qty: 50, qtyRaw: '50', sourceColumns: { date: 10, quantity: 11 } },
  { index: 1, date: '2026-11-27', dateRaw: '2026-11-27', qty: 100, qtyRaw: '100', sourceColumns: { date: 12, quantity: 13 } },
];

async function insertFactoryImports(db: AppDatabase, keys: readonly { readonly batch: string; readonly name: string; readonly supersededAt?: string }[]) {
  await db.insert(schema.storedFiles).values(keys.map(({ batch, name }) => ({
    ...stamp, id: `${batch}-file`, sha256: `${batch}-file`, originalName: name, size: 1, mime: 'application/octet-stream', storedPath: `${batch}-file`, uploadedBy: buyerId,
  })));
  await db.insert(schema.importBatches).values(keys.map(({ batch, supersededAt }) => ({
    ...stamp, id: batch, fileId: `${batch}-file`, factoryPartyId: factory, sourceKey: `factory-progress-v1:${factory}`, template: 'factory-progress-v1',
    status: 'committed', fileMeta: {}, stats: {}, decisions: {}, createdBy: buyerId, committedBy: buyerId, committedAt: at, supersededAt: supersededAt ?? null,
  })));
}

async function insertSources(db: AppDatabase, lineId: string) {
  await insertFactoryImports(db, [
    { batch: 'factory-active', name: '工厂当前.xlsx' },
    { batch: 'factory-history', name: '工厂历史.xlsx', supersededAt: at },
  ]);
  const ref = { ...stamp, factoryPartyId: factory, linkedOrderLineId: lineId, linkStatus: 'manual' };
  await db.insert(schema.factoryShipmentRows).values([
    { ...ref, id: 'historical-shipment', importBatchId: 'factory-history', sheetName: '成品出货明细', rowNo: 8, fingerprint: 'historical', raw: {}, lotRaw: 'LOT-HISTORY', qty: '10', shipOrArriveOn: '2026-11-24' },
    { ...ref, id: 'current-shipment', importBatchId: 'factory-active', sheetName: '成品出货明细', rowNo: 2, fingerprint: 'current',
      raw: { itemCodeRaw: { raw: null, value: null }, qty: { raw: '020.00', value: 20 }, shipOrArriveOn: { raw: '预计9/10', value: null } },
      lotRaw: 'LOT-CURRENT', qty: '20', shipOrArriveOn: null },
  ]);
  const demand = { ...ref, importBatchId: 'factory-active', sheetName: demandSheet, role: 'material', itemCodeRaw: '99010003', nameRaw: '测试通用盖子' };
  await db.insert(schema.factoryMaterialDemandRows).values([
    { ...demand, id: 'material-demand', rowNo: 4, fingerprint: 'demand', slots, raw: { slots, blockLabelRaw: null } },
    { ...demand, id: 'demand-order-blank', rowNo: 5, fingerprint: 'demand-blank', slots: [], raw: { blockPoRaw: null, blockLabelRaw: null } },
    { ...demand, id: 'demand-order-original', rowNo: 6, fingerprint: 'demand-original', slots: [], raw: { blockLabelRaw: '非 PO 分组' } },
  ]);
  const transit = { ...ref, importBatchId: 'factory-active', sheetName: '在途订单汇总' };
  await db.insert(schema.factoryInTransitRows).values([
    { ...transit, id: 'legacy-transit', rowNo: 2, fingerprint: 'transit-legacy', raw: {}, qtyRequired: '10', qtyDeliveredFactory: '5' },
    { ...transit, id: 'recorded-transit', rowNo: 3, fingerprint: 'transit-recorded',
      raw: { nameRaw: { raw: null, value: null }, qtyRequired: { raw: '020.0', value: 20 } }, qtyRequired: '20' },
  ]);
}
