import { expect, it } from 'vitest';
import { makeCreateHintBatches, makeGenerateBatchesFromDemand } from '../../packages/application/src/follow-up/index.js';
import { purchaseOrderKey } from '../../packages/application/src/follow-up/use-cases/purchase-order-ref.js';
import { entityId, orderLineId } from '../../packages/domain/src/index.js';
import { factoryReportRepository } from '../../packages/persistence/src/repositories/factory-reports.js';
import { orderLineRepository } from '../../packages/persistence/src/repositories/order-lines.js';
import { deliveryBatchRepository } from '../../packages/persistence/src/repositories/delivery-batches.js';
import { anOrderLine } from '../../packages/testkit/src/index.js';
import { blockedOnPostgres, gate, onlyLineDetail, seedLine, url, wait, withFixture, writes } from './factory-demand-generation-fixture.js';

it.skipIf(url === undefined)('工厂反序生成两条订单与今日批量建批重叠时，两笔操作都能提交', async () => {
  await withFixture(async ({ main, competing, applicationName, sample }) => {
    await seedLine({ db: main.db, sample, id: sample.lineId });
    const secondLine = orderLineId(`${sample.id}-other`);
    const secondCode = `${sample.code}-second`;
    const secondRow = entityId(`${sample.id}-second`);
    await orderLineRepository(main.db).save(anOrderLine({
      id: secondLine, purchaseOrderId: sample.orderId, lane: 'material', itemCodeRaw: secondCode,
    }));
    const reports = factoryReportRepository(main.db);
    const first = await reports.get(sample.id);
    if (first.demand === null) throw new Error('合成行缺少工厂需求');
    await reports.save({ ...first, id: secondRow, fingerprint: secondRow, rowNo: 5,
      demand: { ...first.demand, itemCodeRaw: secondCode },
    });
    const paused = gate();
    const hint = makeCreateHintBatches(writes(main.db, {
      afterLineLock: async (id) => { if (id === sample.lineId) await paused.hold(); },
    }));
    const hinting = hint({ lineIds: [sample.lineId, secondLine], source: 'today', includeCompleted: false }, sample.buyer);
    const generate = makeGenerateBatchesFromDemand(writes(competing.db));
    let generated: ReturnType<typeof generate> | undefined;
    try {
      await Promise.race([paused.entered, hinting]);
      generated = generate({ rowIds: [secondRow, sample.id] }, sample.buyer);
      await expect.poll(() => blockedOnPostgres(main, applicationName), wait).toBe(true);
    } finally {
      paused.release();
      await Promise.allSettled(generated === undefined ? [hinting] : [hinting, generated]);
    }
    expect((await hinting).skipped.map((entry) => entry.lineId)).toEqual([sample.lineId, secondLine]);
    expect(await generated).toEqual({ createdLines: 0, createdBatches: 2, skipped: [] });
    for (const code of [sample.code, secondCode]) {
      expect((await onlyLineDetail(main.db, code)).batches).toMatchObject([{ seq: 1, plannedQty: 50 }]);
    }
  });
}, 15000);

it.skipIf(url === undefined)('四个不同需求行按相反物料单顺序同时生成时，两单各有两个连续批次', async () => {
  await withFixture(async ({ main, competing, applicationName, sample }) => {
    const reports = factoryReportRepository(main.db);
    const first = await reports.get(sample.id);
    if (first.demand === null) throw new Error('合成行缺少工厂需求');
    const ids = [sample.id];
    const alternatePo = `ALT-${sample.id}`;
    for (const po of [alternatePo, alternatePo, sample.poRaw]) {
      const id = entityId(`${sample.id}-${ids.length}`);
      await reports.save({ ...first, id, fingerprint: id, rowNo: first.rowNo + ids.length,
        demand: { ...first.demand, blockMaterialPoRaw: po },
      });
      ids.push(id);
    }
    const paused = gate();
    const left = makeGenerateBatchesFromDemand(writes(main.db, { afterOriginRead: paused.hold }));
    const right = makeGenerateBatchesFromDemand(writes(competing.db));
    const holding = left({ rowIds: ids.slice(0, 2) }, sample.buyer);
    let waiting: ReturnType<typeof right> | undefined;
    try {
      await Promise.race([paused.entered, holding]);
      waiting = right({ rowIds: ids.slice(2) }, sample.buyer);
      await expect.poll(() => blockedOnPostgres(main, applicationName), wait).toBe(true);
    } finally {
      paused.release();
      await Promise.allSettled(waiting === undefined ? [holding] : [holding, waiting]);
    }
    expect(await holding).toEqual({ createdLines: 2, createdBatches: 2, skipped: [] });
    expect(await waiting).toEqual({ createdLines: 0, createdBatches: 2, skipped: [] });
    const lines = await orderLineRepository(main.db).listByCodeNorm(sample.code);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const batches = await deliveryBatchRepository(main.db).listByOrderLine(line.id);
      expect(batches.map(({ seq }) => seq).sort()).toEqual([1, 2]);
    }
  });
}, 15000);

it.skipIf(url === undefined)('未填、空格和原表占位符共用无单号物料单的事务锁', async () => {
  await withFixture(async ({ main, competing, applicationName }) => {
    const keys = [null, '', '  ', '／', '—'].map((raw) => purchaseOrderKey(raw).poNorm);
    expect(new Set(keys)).toEqual(new Set([null]));
    const paused = gate();
    const holding = writes(main.db).uow.run(async (tx) => {
      await tx.batches.lockDemandGeneration({ materialOrderNumbers: keys.slice(0, 1) });
      await paused.hold();
    });
    let waiting: Promise<void> | undefined;
    try {
      await Promise.race([paused.entered, holding]);
      waiting = writes(competing.db).uow.run((tx) => tx.batches.lockDemandGeneration({ materialOrderNumbers: keys.slice(1) }));
      await expect.poll(() => blockedOnPostgres(main, applicationName), wait).toBe(true);
    } finally {
      paused.release();
      await Promise.allSettled(waiting === undefined ? [holding] : [holding, waiting]);
    }
    await holding;
    await waiting;
  });
}, 15000);
