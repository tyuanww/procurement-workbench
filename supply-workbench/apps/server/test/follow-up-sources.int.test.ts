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

async function createBatch({ client, lineId, date }: { readonly client: Awaited<ReturnType<typeof procurementImportClient>>; readonly lineId: string; readonly date: string }) {
  const response = await client.app.inject({ method: 'POST', url: `/api/v1/lines/${encodeURIComponent(lineId)}/batches`,
    headers: { cookie: client.cookie }, payload: { plannedQty: 100, receiverPartyId: warehouse, dateBuyerConfirmed: date } });
  expect(response.statusCode, response.body).toBe(200);
  return BatchViewSchema.parse(response.json());
}

async function insertSources(db: AppDatabase, lineId: string) {
  const factory = 'source-factory';
  const keys = [
    { batch: 'factory-active', file: 'factory-active-file', name: '工厂当前.xlsx', supersededAt: null },
    { batch: 'factory-history', file: 'factory-history-file', name: '工厂历史.xlsx', supersededAt: at },
  ];
  await db.insert(schema.storedFiles).values(keys.map(({ file, name }) => ({
    ...stamp, id: file, sha256: file, originalName: name, size: 1, mime: 'application/octet-stream', storedPath: file, uploadedBy: buyerId,
  })));
  await db.insert(schema.importBatches).values(keys.map(({ batch, file, supersededAt }) => ({
    ...stamp, id: batch, fileId: file, factoryPartyId: factory, sourceKey: `factory-progress-v1:${factory}`, template: 'factory-progress-v1',
    status: 'committed', fileMeta: {}, stats: {}, decisions: {}, createdBy: buyerId, committedBy: buyerId, committedAt: at, supersededAt,
  })));
  const ref = { ...stamp, factoryPartyId: factory, linkedOrderLineId: lineId, linkStatus: 'manual' };
  await db.insert(schema.factoryShipmentRows).values([
    { ...ref, id: 'historical-shipment', importBatchId: 'factory-history', sheetName: '成品出货明细', rowNo: 8, fingerprint: 'historical', raw: {}, lotRaw: 'LOT-HISTORY', qty: '10', shipOrArriveOn: '2026-11-24' },
    { ...ref, id: 'current-shipment', importBatchId: 'factory-active', sheetName: '成品出货明细', rowNo: 2, fingerprint: 'current', raw: {}, lotRaw: 'LOT-CURRENT', qty: '20', shipOrArriveOn: '2026-11-26' },
  ]);
  const slots = [
    { index: 0, date: '2026-11-24', dateRaw: '2026-11-24', qty: 50, qtyRaw: '50', sourceColumns: { date: 10, quantity: 11 } },
    { index: 1, date: '2026-11-27', dateRaw: '2026-11-27', qty: 100, qtyRaw: '100', sourceColumns: { date: 12, quantity: 13 } },
  ];
  await db.insert(schema.factoryMaterialDemandRows).values({
    ...ref, id: 'material-demand', importBatchId: 'factory-active', sheetName: '09月排产包材原料需求表', rowNo: 4, fingerprint: 'demand',
    role: 'material', itemCodeRaw: '99010003', nameRaw: '测试通用盖子', slots, raw: { slots },
  });
}
