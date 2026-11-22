import { entityId } from '@sw/domain';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { devAuth } from '@sw/auth';
import { FactoryReportRowViewSchema } from '@sw/contracts';
import { createDb, factoryReportRepository, importBatchRepository, migrate, orderLineRepository, partyRepository, purchaseOrderRepository, seed, userDirectory, type SqlExec } from '@sw/persistence';
import { aParty, aPurchaseOrder, anOrderLine } from '../../../packages/testkit/src/index.js';
import { composeImports } from '../src/composition/imports.js';
import { composeMasterData } from '../src/composition/master-data.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerMasterDataRoutes } from '../src/http/master-data/routes.js';
import { loginAs } from './helpers/server.js';
import { buyer as importBuyer, demoPo, importCsv, supplier } from './helpers/synthetic-imports.js';

it('审核供应商别名后，回填已有订单行的采购单', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-master-'));
  const imports = composeImports({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai' });
  const master = composeMasterData({ db: handle.db, timeZone: 'Asia/Shanghai' });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => registerMasterDataRoutes(server, master),
  });
  await importCsv(imports, { fileName: 'po-master.csv', bytes: demoPo(), template: 'po-master-v1' });
  const reviewer = await loginAs(app, 'reviewer');
  const listed = await app.inject({ method: 'GET', url: '/api/v1/master/aliases?status=pending&pageSize=200', headers: { cookie: reviewer } });
  expect(listed.statusCode).toBe(200);
  const alias = listed.json().items.find((item: { rawName: string }) => item.rawName === supplier);
  expect(alias).toBeDefined();
  const approved = await app.inject({ method: 'POST', url: `/api/v1/master/aliases/${alias.id}/approve`, headers: { cookie: reviewer }, payload: { createParty: { displayName: supplier, isSupplier: true, isFactory: true } } });
  expect(approved.statusCode).toBe(200);
  expect(await count(handle.exec, `select count(*)::int as total from order_lines ol join purchase_orders po on po.id = ol.purchase_order_id where po.supplier_party_id = '${approved.json().partyId}'`)).toBe(3);
  await app.close();
  await handle.close();
  await rm(uploadDir, { recursive: true });
}, 180000);

it('采购按角色读主体，不能新建主体', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const master = composeMasterData({ db: handle.db, timeZone: 'Asia/Shanghai' });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => registerMasterDataRoutes(server, master),
  });
  const buyer = await loginAs(app, 'buyer');
  const reviewer = await loginAs(app, 'reviewer');
  const before = await app.inject({ method: 'GET', url: '/api/v1/parties?role=factory&pageSize=200', headers: { cookie: buyer } });
  expect(before.statusCode).toBe(200);
  expect(namesOf(before.json())).not.toContain('我方仓库');
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/parties',
    headers: { cookie: reviewer },
    payload: { displayName: supplier, isSupplier: false, isFactory: true },
  });
  expect(created.statusCode).toBe(200);
  const factories = await app.inject({ method: 'GET', url: '/api/v1/parties?role=factory&pageSize=200', headers: { cookie: buyer } });
  expect(namesOf(factories.json())).toEqual([supplier]);
  const warehouses = await app.inject({ method: 'GET', url: '/api/v1/parties?role=own_warehouse&pageSize=200', headers: { cookie: buyer } });
  expect(namesOf(warehouses.json())).toEqual(['我方仓库']);
  const named = await app.inject({ method: 'GET', url: `/api/v1/parties?q=${encodeURIComponent(supplier)}&pageSize=200`, headers: { cookie: buyer } });
  expect(namesOf(named.json())).toEqual([supplier]);
  const blank = await app.inject({ method: 'GET', url: '/api/v1/parties?q=&pageSize=200', headers: { cookie: buyer } });
  expect(namesOf(blank.json())).toContain('我方仓库');
  expect(namesOf(blank.json())).toContain(supplier);
  const badRole = await app.inject({ method: 'GET', url: '/api/v1/parties?role=nope', headers: { cookie: buyer } });
  expect(badRole.statusCode).toBe(400);
  expect(errorCode(badRole.json())).toBe('VALIDATION_FAILED');
  const denied = await app.inject({
    method: 'POST',
    url: '/api/v1/parties',
    headers: { cookie: buyer },
    payload: { displayName: '不该建成', isSupplier: false, isFactory: true },
  });
  expect(denied.statusCode).toBe(403);
  await app.close();
  await handle.close();
});

it('逐行关联工厂在途记录后返回原表行，且从待关联队列移除', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const master = composeMasterData({ db: handle.db, timeZone: 'Asia/Shanghai' });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => registerMasterDataRoutes(server, master),
  });
  try {
    const factory = aParty();
    const order = aPurchaseOrder({ supplierPartyId: factory.id });
    const line = anOrderLine({ purchaseOrderId: order.id });
    await partyRepository(handle.db).save(factory);
    await purchaseOrderRepository(handle.db).save(order);
    await orderLineRepository(handle.db).save(line);
    const rowId = entityId('factory-line:report');
    const batchId = entityId('factory-link-test-batch');
    const at = '2026-11-18T00:00:00.000Z';
    await importBatchRepository(handle.db).save({
      id: batchId, createdAt: at, updatedAt: at, fileId: entityId('factory-link-test-file'),
      template: 'factory-progress-v1', factoryPartyId: factory.id, status: 'committed',
      fileMeta: {}, stats: {}, decisions: {}, createdBy: importBuyer.id, committedBy: importBuyer.id,
      committedAt: at, rolledBackBy: null, rolledBackAt: null, error: null,
    });
    await factoryReportRepository(handle.db).save({
      id: rowId, importBatchId: batchId, factoryPartyId: factory.id, sheetName: '在途订单汇总', rowNo: 8,
      raw: {}, fingerprint: 'factory-link-test-row', linkedOrderLineId: null, linkStatus: 'unlinked', linkReason: null,
      kind: 'in_transit', shipment: null, demand: null,
      inTransit: { poRaw: order.poRaw, poNorm: order.poNorm, nameRaw: line.nameRaw, itemCodeRaw: 'FACTORY-8', barcodeRaw: null, qtyRequired: 120 },
    });
    const cookie = await loginAs(app, 'reviewer');
    const headers = { cookie };
    const queue = '/api/v1/factory-reports/unlinked';
    const before = await app.inject({ method: 'GET', url: queue, headers });
    expect(before.statusCode).toBe(200);
    expect(before.json().items).toEqual([expect.objectContaining({ id: rowId, linkStatus: 'unlinked' })]);

    const linked = await app.inject({
      method: 'POST',
      url: '/api/v1/factory-reports/in-transit/' + encodeURIComponent(rowId) + '/link',
      headers,
      payload: { orderLineId: line.id },
    });
    expect(linked.statusCode).toBe(200);
    expect(FactoryReportRowViewSchema.parse(linked.json())).toMatchObject({
      id: rowId, kind: 'in_transit', rowNo: 8, linkedOrderLineId: line.id, linkStatus: 'manual',
      payload: { itemCodeRaw: { value: 'FACTORY-8' }, qtyRequired: { value: 120 } },
    });
    const after = await app.inject({ method: 'GET', url: queue, headers });
    expect(after.statusCode).toBe(200);
    expect(after.json().items).toEqual([]);

    const oldScheduleId = entityId('legacy-schedule:report');
    const reports = factoryReportRepository(handle.db);
    await reports.save({
      id: oldScheduleId, importBatchId: batchId, factoryPartyId: factory.id, sheetName: '排产计划', rowNo: 20,
      raw: {}, fingerprint: 'legacy-schedule-test-row', linkedOrderLineId: null, linkStatus: 'unlinked', linkReason: null,
      kind: 'schedule', shipment: null, demand: null, inTransit: null,
    });
    const invalidSchedule = await app.inject({
      method: 'POST',
      url: '/api/v1/factory-reports/schedule/' + encodeURIComponent(oldScheduleId) + '/link',
      headers,
      payload: { orderLineId: line.id },
    });
    expect(invalidSchedule.statusCode).toBe(404);
    expect(await reports.get(oldScheduleId)).toMatchObject({ linkedOrderLineId: null, linkStatus: 'unlinked' });
  } finally {
    await app.close();
    await handle.close();
  }
});

function namesOf(body: unknown): readonly string[] {
  if (!isRecord(body) || !Array.isArray(body.items)) throw new Error('主体列表没有 items');
  return body.items.map(nameOf);
}

function nameOf(item: unknown): string {
  if (!isRecord(item) || typeof item.displayName !== 'string') throw new Error('主体没有名字');
  return item.displayName;
}

function errorCode(body: unknown): string {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.code !== 'string') throw new Error('没有错误码');
  return body.error.code;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function count(exec: SqlExec, statement: string): Promise<number> {
  const result = await exec(statement);
  const row = rowsOf(result)[0];
  if (typeof row !== 'object' || row === null || !('total' in row)) throw new Error('计数没有结果');
  return typeof row.total === 'number' ? row.total : Number(row.total);
}

function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return rowsOf(result[0]);
  if (typeof result === 'object' && result !== null && 'rows' in result && Array.isArray(result.rows)) return result.rows;
  throw new Error('计数没有结果');
}
