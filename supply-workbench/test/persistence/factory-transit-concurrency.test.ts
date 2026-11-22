import { randomInt, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { makeCreateLineFromInTransit } from '../../packages/application/src/follow-up/index.js';
import { entityId } from '../../packages/domain/src/index.js';
import { createDb, type AppDatabase } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { requireDatabase } from '../../packages/persistence/src/require-database.js';
import { auditRepository } from '../../packages/persistence/src/repositories/audit-log.js';
import { factoryReportRepository } from '../../packages/persistence/src/repositories/factory-reports.js';
import { placeholderStores } from '../../packages/persistence/src/repositories/index.js';
import { orderLineRepository } from '../../packages/persistence/src/repositories/order-lines.js';
import { purchaseOrderRepository } from '../../packages/persistence/src/repositories/purchase-orders.js';
import { settingsRepository } from '../../packages/persistence/src/repositories/settings.js';
import { seed } from '../../packages/persistence/src/seed.js';
import { createUnitOfWork } from '../../packages/persistence/src/unit-of-work.js';
import { systemIds } from '../../apps/server/src/system/ids.js';
import { FixedClock } from '../../packages/testkit/src/index.js';

const databaseUrl = process.env.DATABASE_URL;

it.skipIf(databaseUrl === undefined)('PostgreSQL 同一在途行并发转单只保留一个订单行', async () => {
  if (databaseUrl === undefined) throw new Error('需要一次性 PostgreSQL 库');
  const handle = await createDb({ driver: 'pg', url: databaseUrl });
  try {
    await migrate(handle.exec);
    await seed(handle.exec);
    const rowId = entityId(randomUUID());
    const rawPo = `PO20261121${randomInt(100000, 1000000)}`;
    const code = `TRANSIT-${rowId}`;
    const reports = factoryReportRepository(handle.db);
    await reports.save({
      id: rowId, kind: 'in_transit', importBatchId: entityId('transit-concurrency'), fingerprint: rowId,
      factoryPartyId: entityId('transit-factory'), raw: {}, sheetName: '在途订单汇总', rowNo: 1,
      linkedOrderLineId: null, linkStatus: 'unlinked', linkReason: null, shipment: null, demand: null,
      inTransit: { poRaw: rawPo, poNorm: rawPo, nameRaw: '并发测试面霜', itemCodeRaw: code, barcodeRaw: null, qtyRequired: 10 },
    });
    const command = makeCreateLineFromInTransit(transitWrites(handle.db));
    const actor = { id: entityId('0199f0a0-0000-7000-8000-000000000002'), name: '采购甲', roles: ['buyer'] as const };
    const result = await Promise.allSettled([command({ rowId }, actor), command({ rowId }, actor)]);
    const succeeded = result.find((entry) => entry.status === 'fulfilled');
    const rejected = result.find((entry) => entry.status === 'rejected');
    if (succeeded === undefined || rejected === undefined) throw new Error(JSON.stringify(result));
    expect(rejected.reason).toMatchObject({ code: 'STATE_CONFLICT', details: { state: '在途行已关联订单' } });
    const linked = await reports.get(rowId);
    expect(linked.linkedOrderLineId).toBe(succeeded.value.lineId);
    const lines = await orderLineRepository(handle.db).listByCodeNorm(code);
    expect(lines.map((line) => line.id)).toEqual([succeeded.value.lineId]);
    expect(await purchaseOrderRepository(handle.db).listByPoNorm(rawPo)).toHaveLength(1);
  } finally {
    await handle.close();
  }
}, 15000);

function transitWrites(db: AppDatabase) {
  let readsComplete: () => void = () => { throw new Error('屏障未初始化'); };
  const twoReads = new Promise<void>((resolve) => { readsComplete = resolve; });
  let reads = 0;
  const uow = createUnitOfWork(db, (transaction) => {
    const tx = requireDatabase(transaction);
    const reports = factoryReportRepository(tx);
    return {
      ...placeholderStores(),
      orderLines: orderLineRepository(tx),
      purchaseOrders: purchaseOrderRepository(tx),
      settings: settingsRepository(tx),
      audit: auditRepository(tx),
      factoryReports: {
        ...reports,
        async get(id: string) {
          const row = await reports.get(id);
          expect(row.linkedOrderLineId).toBeNull();
          if (++reads === 2) readsComplete();
          await twoReads;
          return row;
        },
      },
    };
  });
  return { uow, clock: new FixedClock('2026-11-21T00:00:00.000Z'), ids: systemIds() };
}
