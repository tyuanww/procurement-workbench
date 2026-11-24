import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { devAuth } from '@sw/auth';
import { BottleneckSummarySchema, FactoryLinkCountsSchema, LineFactoryLinkViewSchema, LineSummarySchema, OrderLineDetailSchema, OrderLineRowSchema, StuckDashboardSchema, listResponseSchema } from '@sw/contracts';
import { entityId, orderLineId } from '@sw/domain';
import { readXlsx } from '@sw/importers';
import { createDb, migrate, orderLineRepository, partyRepository, purchaseOrderRepository, schema, seed, userDirectory, type AppDatabase } from '@sw/persistence';
import { FixedClock, aParty, aPurchaseOrder, anOrderLine } from '../../../packages/testkit/src/index.js';
import { composeFactoryLinks } from '../src/composition/factory-links.js';
import { composeFollowUp, followUpAttachmentMaxBytes } from '../src/composition/follow-up.js';
import { composeMasterData } from '../src/composition/master-data.js';
import { composePerformance } from '../src/composition/performance.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerFactoryLinkRoutes } from '../src/http/factory-links/routes.js';
import { registerFollowUpRoutes } from '../src/http/follow-up/routes.js';
import { registerMasterDataRoutes } from '../src/http/master-data/routes.js';
import { registerPerformanceRoutes } from '../src/http/performance/routes.js';
import { loginAs } from './helpers/server.js';

const at = '2026-11-23T00:00:00.000Z';
const earlier = '2026-11-20T00:00:00.000Z';
const stamp = { createdAt: at, updatedAt: at };
const factory = aParty({ id: entityId('scope-yinong'), displayName: '宜侬' });
const other = aParty({ id: entityId('scope-other'), displayName: '另一家工厂' });
const adminId = '0199f0a0-0000-7000-8000-000000000001';
const buyerId = '0199f0a0-0000-7000-8000-000000000002';
const period = 'from=2026-11-01&to=2026-11-30';

it('活动上报挂接和在途建单显示同一代工厂，订单筛选、汇总、导出和看板一致', async () => {
  const handle = await createDb({ driver: 'pglite' });
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-factory-scope-'));
  try {
    await migrate(handle.exec);
    await seed(handle.exec);
    await seedReports(handle.db);
    const app = await openApp({ db: handle.db, uploadDir });
    try {
      const reviewer = { cookie: await loginAs(app, 'reviewer') };
      const admin = { cookie: await loginAs(app, 'admin') };
      const manager = { cookie: await loginAs(app, 'manager') };
      const attached = await app.inject({ method: 'POST', url: '/api/v1/factory-reports/in-transit/attach/link', headers: reviewer, payload: { orderLineId: 'attached' } });
      const created = await app.inject({ method: 'POST', url: '/api/v1/factory-reports/in-transit/create/create-line', headers: admin });
      expect(attached.statusCode).toBe(200);
      expect(attached.json()).toMatchObject({ linkedOrderLineId: 'attached', linkStatus: 'manual' });
      expect(created.statusCode).toBe(200);
      const createdId = OrderLineDetailSchema.parse(created.json()).line.id;

      const get = (suffix: string) => app.inject({ url: `/api/v1/lines${suffix}`, headers: admin });
      const list = async (query: string) => {
        const response = await get(`?${query}`);
        expect(response.statusCode).toBe(200);
        return listResponseSchema(OrderLineRowSchema).parse(response.json());
      };
      const missingFactory = async () => {
        const response = await app.inject({ url: `/api/v1/dashboard/bottlenecks?${period}`, headers: manager });
        expect(response.statusCode).toBe(200);
        return BottleneckSummarySchema.parse(response.json()).categories.find(({ key }) => key === 'missing_factory')?.count;
      };
      const filter = `factoryPartyId=${factory.id}`;
      const scoped = await list(filter);
      expect(scoped.page.total).toBe(2);
      expect(scoped.items.map(({ id }) => id).sort()).toEqual([createdId, 'attached'].sort());
      expect(scoped.items.map((item) => item.factory)).toEqual([reference(factory), reference(factory)]);
      expect((await list(`${filter}&pageSize=1`)).page).toMatchObject({ total: 2, pageSize: 1 });
      await expectFactoryCounts({ app, headers: reviewer, counts: { linked: 3, manual: 0, unlinked: 4 } });

      for (const id of ['attached', createdId]) {
        const link = await get(`/${id}/factory-link`);
        expect(link.statusCode).toBe(200);
        expect(LineFactoryLinkViewSchema.parse(link.json())).toMatchObject({ factory: reference(factory), source: 'factory_progress' });
        const detail = await get(`/${id}`);
        expect(detail.statusCode).toBe(200);
        expect(OrderLineDetailSchema.parse(detail.json()).line.factory).toEqual(reference(factory));
      }

      const summary = await get(`/summary?${filter}&pageSize=1`);
      expect(summary.statusCode).toBe(200);
      expect(LineSummarySchema.parse(summary.json()).total).toBe(2);
      const exported = await get(`/export.xlsx?lane=finished&${filter}&pageSize=1`);
      expect(exported.statusCode).toBe(200);
      expectFactoryExport(exported.rawPayload);

      expect((await list(`supplierPartyId=${factory.id}`)).items.map(({ id }) => id).sort()).toEqual([createdId, 'supplier-only'].sort());
      expect((await list(`factoryPartyId=${other.id}`)).items.map(({ id }) => id)).toEqual(['legacy-current']);
      expect((await list('inTransitFactory=yinong')).items).toEqual([]);
      expect(await missingFactory()).toBe(4);
      const stuck = await app.inject({ url: `/api/v1/dashboard/stuck?${period}&cause=missing_factory`, headers: manager });
      expect(stuck.statusCode).toBe(200);
      expect(StuckDashboardSchema.parse(stuck.json()).total).toBe(0);

      const changed = await app.inject({ method: 'PUT', url: `/api/v1/lines/${createdId}/factory-link`, headers: reviewer, payload: { factoryPartyId: other.id } });
      expect(changed.statusCode, changed.body).toBe(200);
      expect(LineFactoryLinkViewSchema.parse(changed.json())).toMatchObject({ factory: reference(other), status: 'manual' });
      const readAsReviewer = await app.inject({ url: `/api/v1/lines/${createdId}/factory-link`, headers: reviewer });
      expect(readAsReviewer.statusCode).toBe(403);
      expect((await get(`/${createdId}/factory-link`)).json()).toEqual(changed.json());
      const cancelled = await app.inject({ method: 'PUT', url: '/api/v1/lines/attached/factory-link', headers: reviewer, payload: { factoryPartyId: null, reason: '撤销工厂关联' } });
      expect(cancelled.statusCode).toBe(200);
      expect(LineFactoryLinkViewSchema.parse(cancelled.json())).toMatchObject({ factory: null, status: 'unlinked', source: 'manual' });
      expect((await list(filter)).items).toEqual([]);
      expect((await list(`factoryPartyId=${other.id}`)).items.map(({ id }) => id).sort()).toEqual([createdId, 'legacy-current'].sort());
      expect(await missingFactory()).toBe(5);
      await expectFactoryCounts({ app, headers: reviewer, counts: { linked: 1, manual: 1, unlinked: 5 } });
      await expectCancellationAfterRelink({ app, headers: admin });
    } finally {
      await app.close();
    }
  } finally {
    await handle.close();
    await rm(uploadDir, { recursive: true });
  }
});

async function expectFactoryCounts({ app, headers, counts }: {
  readonly app: Awaited<ReturnType<typeof openApp>>;
  readonly headers: { readonly cookie: string };
  readonly counts: { readonly linked: number; readonly manual: number; readonly unlinked: number };
}): Promise<void> {
  const response = await app.inject({ url: '/api/v1/factory-links/counts', headers });
  expect(response.statusCode).toBe(200);
  expect(FactoryLinkCountsSchema.parse(response.json())).toEqual(counts);
}

async function expectCancellationAfterRelink({ app, headers }: {
  readonly app: Awaited<ReturnType<typeof openApp>>;
  readonly headers: { readonly cookie: string };
}): Promise<void> {
  const relink = await app.inject({ method: 'POST', url: '/api/v1/factory-links/relink', headers });
  expect(relink.statusCode).toBe(200);
  const link = await app.inject({ url: '/api/v1/lines/attached/factory-link', headers });
  expect(link.statusCode).toBe(200);
  expect(LineFactoryLinkViewSchema.parse(link.json())).toMatchObject({ factory: null, status: 'unlinked', source: 'manual' });
}

function expectFactoryExport(bytes: Buffer): void {
  const [sheet] = readXlsx({ bytes, fileName: '订单.xlsx' }).sheets;
  if (sheet === undefined) throw new Error('导出缺少订单行工作表');
  expect(sheet.rowCount).toBe(3);
  expect(sheet.cell(1, 4)?.text).toBe('工厂');
  expect([sheet.cell(2, 1)?.text, sheet.cell(3, 1)?.text].sort()).toEqual(['PO-SCOPE-ATTACHED', 'PO202611230001']);
  expect([sheet.cell(2, 4)?.text, sheet.cell(3, 4)?.text]).toEqual([factory.displayName, factory.displayName]);
}

function openApp({ db, uploadDir }: { readonly db: AppDatabase; readonly uploadDir: string }) {
  const context = { db, clock: new FixedClock(at), timeZone: 'Asia/Shanghai' };
  const api = composeFollowUp({ ...context, uploadDir });
  return buildHttpApp({
    auth: devAuth({ directory: userDirectory(db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => {
      registerFollowUpRoutes({ app: server, api, attachmentMaxBytes: followUpAttachmentMaxBytes() });
      registerMasterDataRoutes(server, composeMasterData(context));
      registerFactoryLinkRoutes(server, composeFactoryLinks(context));
      registerPerformanceRoutes(server, composePerformance(context));
    },
  });
}

async function seedReports(db: AppDatabase) {
  for (const party of [factory, other]) await partyRepository(db).save(party);
  for (const id of ['attached', 'supplier-only', 'retired', 'ambiguous', 'legacy-current', 'legacy-old']) {
    const poRaw = `PO-SCOPE-${id.toUpperCase()}`;
    const order = aPurchaseOrder({
      id: entityId(`po-${id}`), poRaw, poNorm: poRaw, poFormat: 'OTHER',
      supplierPartyId: id === 'supplier-only' ? factory.id : other.id,
    });
    await purchaseOrderRepository(db).save(order);
    await orderLineRepository(db).save(anOrderLine({ id: orderLineId(id), purchaseOrderId: order.id }));
  }
  const baseBatch = { ...stamp, template: 'factory-progress-v1', status: 'committed', fileMeta: {}, stats: {}, decisions: {}, createdBy: adminId, committedBy: adminId };
  await db.insert(schema.importBatches).values([
    { ...baseBatch, id: 'active', fileId: 'active.xlsx', factoryPartyId: factory.id, sourceKey: `factory-progress-v1:${factory.id}`, committedAt: at },
    { ...baseBatch, id: 'retired', fileId: 'retired.xlsx', factoryPartyId: factory.id, sourceKey: `factory-progress-v1:${factory.id}`, committedAt: earlier, supersededAt: at },
    { ...baseBatch, id: 'legacy-current', fileId: 'legacy-new.xlsx', factoryPartyId: other.id, committedAt: at },
    { ...baseBatch, id: 'legacy-old', fileId: 'legacy-old.xlsx', factoryPartyId: other.id, committedAt: earlier },
  ]);
  await db.insert(schema.factoryInTransitRows).values([
    { id: 'attach', importBatchId: 'active', factoryPartyId: factory.id, linkStatus: 'unlinked' },
    { id: 'create', importBatchId: 'active', factoryPartyId: factory.id, linkStatus: 'unlinked', poRaw: 'PO202611230001', poNorm: 'PO202611230001' },
    { id: 'retired', importBatchId: 'retired', factoryPartyId: factory.id, linkStatus: 'manual', linkedOrderLineId: 'retired' },
    { id: 'ambiguous', importBatchId: 'active', factoryPartyId: factory.id, linkStatus: 'ambiguous', linkedOrderLineId: 'ambiguous' },
    { id: 'legacy-current', importBatchId: 'legacy-current', factoryPartyId: other.id, linkStatus: 'linked', linkedOrderLineId: 'legacy-current' },
    { id: 'legacy-old', importBatchId: 'legacy-old', factoryPartyId: other.id, linkStatus: 'linked', linkedOrderLineId: 'legacy-old' },
  ].map((row, index) => ({ ...stamp, ...row, rowNo: index + 1, raw: {}, fingerprint: row.id, sheetName: '在途订单汇总', nameRaw: '测试订单', qtyRequired: '10' })));
  await db.insert(schema.lineFactoryLinks).values({
    ...stamp, id: 'automatic-negative', orderLineId: 'attached', factoryPartyId: null, status: 'unlinked', source: 'relink',
    confidence: 'none', reason: 'NO_FACTORY_ROW_MATCH', linkedAt: at,
  });
  await seedPhysicalTransit(db);
}

async function seedPhysicalTransit(db: AppDatabase) {
  await db.insert(schema.deliveryBatches).values({
    ...stamp, id: 'shipped-batch', orderLineId: 'attached', seq: 1, plannedQty: '10', plannedUnit: '盒',
    receiverPartyId: 'warehouse', status: 'shipped', statusChangedAt: at, origin: 'manual',
  });
  await db.insert(schema.shipments).values({
    ...stamp, id: 'shipment-batch', batchId: 'shipped-batch', qty: '10', shippedOn: '2026-11-23', source: 'manual', createdBy: buyerId,
    fulfillment: { kind: 'verified', unit: '盒', evidence: '实物在途', reviewReason: null },
  });
}

function reference(party: typeof factory) {
  return { id: party.id, displayName: party.displayName };
}
