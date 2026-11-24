import { devAuth } from '@sw/auth';
import { entityId, normalizeText } from '@sw/domain';
import { aliasRepository, createDb, migrate, partyRepository, purchaseOrderRepository, seed, userDirectory } from '@sw/persistence';
import { expect, it } from 'vitest';
import { aParty, aPurchaseOrder } from '../../../packages/testkit/src/index.js';
import { composeFactoryLinks } from '../src/composition/factory-links.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerFactoryLinkRoutes } from '../src/http/factory-links/routes.js';
import { loginAs } from './helpers/server.js';

it('工厂关联板回填已审批的供应商别名，保留已有主体并拒绝采购角色', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const api = composeFactoryLinks({ db: handle.db, timeZone: 'Asia/Shanghai' });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => registerFactoryLinkRoutes(server, api),
  });
  try {
    const parties = partyRepository(handle.db);
    const supplier = aParty({ id: entityId('backfill-supplier'), displayName: '待回填供应商', isSupplier: true });
    const existing = aParty({ id: entityId('existing-supplier'), displayName: '已有供应商', isSupplier: true });
    await parties.save(supplier);
    await parties.save(existing);

    const rawName = '待回填供应商别名';
    const at = '2026-11-18T00:00:00.000Z';
    await aliasRepository(handle.db).save({
      id: entityId('backfill-alias'), createdAt: at, updatedAt: at, rawName, normName: normalizeText(rawName),
      partyId: supplier.id, status: 'approved', firstSeenImportBatchId: null, seenCount: 1,
      reviewedBy: entityId('0199f0a0-0000-7000-8000-000000000001'), reviewedAt: at,
    });
    const orders = purchaseOrderRepository(handle.db);
    const missing = aPurchaseOrder({ id: entityId('backfill-eligible'), supplierRaw: ` ${rawName} `, supplierPartyId: null });
    const assigned = aPurchaseOrder({ id: entityId('backfill-assigned'), supplierRaw: rawName, supplierPartyId: existing.id });
    const unrelated = aPurchaseOrder({ id: entityId('backfill-unrelated'), supplierRaw: '其他供应商', supplierPartyId: null });
    for (const order of [missing, assigned, unrelated]) await orders.save(order);

    const url = '/api/v1/factory-links/backfill-suppliers';
    const buyer = await loginAs(app, 'buyer');
    const denied = await app.inject({ method: 'POST', url, headers: { cookie: buyer } });
    expect(denied.statusCode).toBe(403);
    expect(await orders.get(missing.id)).toMatchObject({ supplierPartyId: null });

    const admin = await loginAs(app, 'admin');
    const backfill = () => app.inject({ method: 'POST', url, headers: { cookie: admin } });
    const first = await backfill();
    expect(first.statusCode, first.body).toBe(200);
    expect(first.json()).toEqual({ updated: 1 });
    expect(await orders.get(missing.id)).toMatchObject({ supplierPartyId: supplier.id });
    expect(await orders.get(assigned.id)).toEqual(assigned);
    expect(await orders.get(unrelated.id)).toEqual(unrelated);
    const repeat = await backfill();
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json()).toEqual({ updated: 0 });
  } finally {
    await app.close();
    await handle.close();
  }
});
