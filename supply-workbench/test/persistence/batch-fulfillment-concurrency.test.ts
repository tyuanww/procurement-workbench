import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { makeRecordReceipt } from '../../packages/application/src/follow-up/use-cases/record-receipt.js';
import { makeUpdateBatch } from '../../packages/application/src/follow-up/use-cases/update-batch.js';
import type { Actor } from '../../packages/application/src/shared/actor.js';
import { batchFulfillment, createBatch, deliveryBatchId, entityId, localDate, orderLineId, productId } from '../../packages/domain/src/index.js';
import { createDb, type AppDatabase, type AppHandle } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { requireDatabase } from '../../packages/persistence/src/require-database.js';
import { auditRepository, countAudit } from '../../packages/persistence/src/repositories/audit-log.js';
import { deliveryBatchRepository } from '../../packages/persistence/src/repositories/delivery-batches.js';
import { placeholderStores } from '../../packages/persistence/src/repositories/index.js';
import { orderLineRepository } from '../../packages/persistence/src/repositories/order-lines.js';
import { createUnitOfWork } from '../../packages/persistence/src/unit-of-work.js';
import { anOrderLine, FixedClock } from '../../packages/testkit/src/index.js';

const url = process.env.DATABASE_URL;
const clock = new FixedClock('2026-11-19T00:00:00.000Z');
const actor: Actor = { id: entityId('cg06-buyer'), name: '采购并发测试', roles: ['buyer'] };
const promiseDate = localDate('2026-11-24');

it.skipIf(url === undefined).each(['promise', 'receipt'] as const)('真实 PostgreSQL 同批竞争，%s 先取得锁时仍保留两次写入', async (firstKind) => {
  if (url === undefined) throw new Error('需要一次性 PostgreSQL 库');
  const batchId = deliveryBatchId(randomUUID());
  const lineId = orderLineId(randomUUID());
  const secondName = `cg06-${batchId}`;
  const secondUrl = new URL(url);
  secondUrl.searchParams.set('application_name', secondName);
  const first = await createDb({ driver: 'pg', url });
  const second = await createDb({ driver: 'pg', url: secondUrl.href });
  try {
    await migrate(first);
    const lines = orderLineRepository(first.db);
    const batches = deliveryBatchRepository(first.db);
    await lines.save(anOrderLine({ id: lineId, lane: 'material', qtyOrdered: 10000, unit: '件' }));
    await batches.save(createBatch({
      orderLineId: lineId, seq: 1, plannedQty: 10000, plannedUnit: '件', receiverPartyId: entityId('cg06-warehouse'),
      dateSupplierPromised: localDate('2026-11-23'), origin: 'manual',
    }, { at: clock.now(), by: actor.id, isAdmin: false, nextId: batchId }));
    const entered = gate();
    const release = gate();
    const holdsLock = writes(first.db, async () => {
      entered.resolve();
      await release.promise;
    });
    const waitsForLock = writes(second.db);
    async function change(kind: 'promise' | 'receipt', deps: ReturnType<typeof writes>) {
      if (kind === 'promise') return makeUpdateBatch(deps)({ batchId, dateSupplierPromised: promiseDate }, actor);
      return makeRecordReceipt(deps)({
        batchId, qty: 2000, receivedOn: clock.today(), category: 'packaging',
        fulfillment: { kind: 'received', unit: '件', evidence: `签收单 ${batchId}`, disposition: 'normal' },
      }, actor);
    }
    const holding = change(firstKind, holdsLock);
    // 提前接收异常，避免先写入口异常后一直等待屏障。
    await Promise.race([entered.promise, holding]);
    const waiting = change(firstKind === 'promise' ? 'receipt' : 'promise', waitsForLock);
    const completed = Promise.all([holding, waiting]);
    let hasBlocked = false;
    try {
      hasBlocked = await blockedOnPostgres(first, secondName);
    } finally {
      release.resolve();
      await completed;
    }
    expect(hasBlocked).toBe(true);
    const saved = await batches.getWithRecords(batchId);
    expect(await countAudit(first.db, batchId)).toBe(1);
    const [receipt] = saved.receipts;
    if (receipt === undefined) throw new Error('并发后没有实收记录');
    expect(await countAudit(first.db, receipt.id)).toBe(1);
    expect(saved.batch).toMatchObject({ dateSupplierPromised: promiseDate, status: 'partially_received' });
    expect((await lines.get(lineId)).stage).toBe('partially_received');
    expect(saved.dateChanges).toEqual([expect.objectContaining({ field: 'dateSupplierPromised', oldValue: '2026-11-23', newValue: promiseDate })]);
    expect(saved.receipts).toEqual([expect.objectContaining({ qty: 2000, fulfillment: { kind: 'received', unit: '件', evidence: `签收单 ${batchId}`, disposition: 'normal', reviewReason: null } })]);
    expect(batchFulfillment(saved)).toMatchObject({ unshippedQty: 8000, inTransitQty: 0, receivedQty: 2000, receiptWithoutShipmentQty: 2000 });
  } finally {
    await first.close();
    await second.close();
  }
});

function writes(db: AppDatabase, locked?: () => Promise<void>) {
  const uow = createUnitOfWork(db, (transaction) => {
    const tx = requireDatabase(transaction);
    const batches = deliveryBatchRepository(tx);
    return {
      ...placeholderStores(),
      batches: {
        ...batches,
        async lockWithRecords(id: string) {
          const latest = await batches.lockWithRecords(id);
          await locked?.();
          return latest;
        },
      },
      orderLines: orderLineRepository(tx),
      audit: auditRepository(tx),
    };
  });
  return {
    uow,
    clock,
    ids: { next: () => entityId(randomUUID()), orderLine: () => orderLineId(randomUUID()), product: () => productId(randomUUID()), deliveryBatch: () => deliveryBatchId(randomUUID()) },
  };
}

async function blockedOnPostgres(observer: AppHandle, secondName: string): Promise<boolean> {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    // secondName 由测试生成，只含固定前缀、连字符及 UUID。
    const result = await observer.exec(`select exists (
      select 1 from pg_stat_activity where application_name = '${secondName}' and cardinality(pg_blocking_pids(pid)) > 0
    ) as waiting`);
    if (hasWaitingTransaction(result)) return true;
    await setTimeout(20);
  }
  return false;
}

function hasWaitingTransaction(value: unknown): boolean {
  return typeof value === 'object' && value !== null && 'rows' in value && Array.isArray(value.rows) && value.rows[0]?.waiting === true;
}

function gate() {
  let resolve: () => void = () => { throw new Error('屏障未初始化'); };
  const promise = new Promise<void>((ready) => { resolve = ready; });
  return { promise, resolve };
}
