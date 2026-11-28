import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { BatchViewSchema, ShipmentViewSchema } from '@sw/contracts';
import { schema, type AppDatabase } from '@sw/persistence';
import { must, openProcurementImport, procurementImportClient } from './helpers/procurement-import.js';

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
    expect(read.factoryReports.demand).toMatchObject([{ sheetName: '09月排产包材原料需求表', rowNo: 4, payload: {
      slots: [{ sourceColumns: { date: 10, quantity: 11 }, qtyRaw: '50' }, { sourceColumns: { date: 12, quantity: 13 }, qtyRaw: '100' }],
    } }]);
    expect(read.factoryReports.shipments.map(({ id }) => id)).toEqual(['current-shipment']);
    expect(read.factoryReports.shipments[0]?.payload.shipOrArriveOn).toEqual({ raw: '预计9/10', value: null });
    expect(read.archivedShipmentSources).toMatchObject([{ id: 'historical-shipment', rowNo: 8, payload: { lotRaw: { raw: 'LOT-HISTORY' } } }]);
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

it('生成的两批各自只回查需求表对应的一组单元格，工厂换表后仍指向原文件', async () => {
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
      return [id, { importBatchId: 'factory-original', sheetName: demandSheet, rowNo: 4, slot: { index, dateRaw, qtyRaw, sourceColumns } }];
    }));
    expect(before.batchDemandSources).toEqual(expected);
    expect(after.batchDemandSources).toEqual(expected);
    expect(after.sourceFiles).toMatchObject({ 'factory-original': '需求原表.xlsx', 'factory-replacement': '需求换表.xlsx' });
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
      raw: { shipOrArriveOn: { raw: '预计9/10', value: null } }, lotRaw: 'LOT-CURRENT', qty: '20', shipOrArriveOn: null },
  ]);
  await db.insert(schema.factoryMaterialDemandRows).values({
    ...ref, id: 'material-demand', importBatchId: 'factory-active', sheetName: demandSheet, rowNo: 4, fingerprint: 'demand',
    role: 'material', itemCodeRaw: '99010003', nameRaw: '测试通用盖子', slots, raw: { slots },
  });
}
