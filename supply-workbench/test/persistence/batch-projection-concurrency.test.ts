import { expect, it } from 'vitest';
import { makeAssignLines, makeCreateBatch, makeDeleteBatch, makeUpdateBatch } from '../../packages/application/src/follow-up/index.js';
import { makeCommitImport } from '../../packages/application/src/imports/index.js';
import { entityId, localDate, orderLineId, type DeliveryBatch, type ImportRow } from '../../packages/domain/src/index.js';
import type { AppDatabase } from '../../packages/persistence/src/client.js';
import { followUpQueries } from '../../packages/persistence/src/queries/follow-up/index.js';
import { countAudit } from '../../packages/persistence/src/repositories/audit-log.js';
import { deliveryBatchRepository } from '../../packages/persistence/src/repositories/delivery-batches.js';
import { importBatchRepository } from '../../packages/persistence/src/repositories/import-batches.js';
import { orderLineRepository } from '../../packages/persistence/src/repositories/order-lines.js';
import '../application/load-import-registry.js';
import { blockedOnPostgres, clock, gate, seedLine, settled, url, wait, withFixture, writes, type Sample } from './factory-demand-generation-fixture.js';

it.skipIf(url === undefined)('删除下一批与延期另一批重叠后，列表显示实际最早的开放批次', async () => {
  await withFixture(async ({ main, competing, applicationName, sample }) => {
    await seedLine({ db: main.db, sample, id: sample.lineId });
    const create = makeCreateBatch(writes(main.db));
    const createOn = (date: string) => create({
      lineId: sample.lineId, receiverPartyId: sample.factoryId, plannedQty: 5, dateBuyerConfirmed: localDate(date),
    }, sample.buyer);
    const edited = await createOn('2026-11-29');
    const removed = await createOn('2026-11-28');
    const expected = await createOn('2026-11-30');

    const paused = gate();
    const update = makeUpdateBatch(pauseBatchSave(main.db, { paused, timing: 'before' }))({
      batchId: edited.batchId, dateBuyerConfirmed: localDate('2026-12-01'), reason: '合成确认延期',
    }, sample.buyer);
    let deletion: ReturnType<ReturnType<typeof makeDeleteBatch>> | undefined;
    try {
      await Promise.race([update, paused.entered]);
      const action = settled(makeDeleteBatch(writes(competing.db))({ batchId: removed.batchId }, sample.buyer));
      deletion = action.result;
      await expect.poll(() => action.isDone() || blockedOnPostgres(main, applicationName), wait).toBe(true);
    } finally {
      paused.release();
      await Promise.allSettled(deletion === undefined ? [update] : [update, deletion]);
    }
    await update;
    await deletion;
    expect(await deliveryBatchRepository(main.db).find(removed.batchId)).toBeUndefined();
    expect(await orderLineRepository(main.db).get(sample.lineId))
      .toMatchObject({ nextDueBatchId: expected.batchId, nextDueDate: '2026-11-30' });
    const list = followUpQueries({ db: main.db, clock, timeZone: 'Asia/Shanghai' });
    expect((await list.list({ q: sample.code })).items[0]?.nextDue).toMatchObject({ batchId: expected.batchId });
  });
}, 15000);

it.skipIf(url === undefined)('批量确认到货和反序派单相遇后都提交，确认历史与审计只写一次', async () => {
  await withFixture(async ({ main, competing, applicationName, sample }) => {
    const otherLineId = orderLineId(`${sample.id}-other`);
    await seedLine({ db: main.db, sample, id: sample.lineId });
    await seedLine({ db: main.db, sample, id: otherLineId });
    const earliest = await seedArrivalEdit(main.db, { sample, lineIds: [sample.lineId, otherLineId], date: '2026-11-28' });
    const edited = await seedArrivalEdit(main.db, { sample, lineIds: [sample.lineId, otherLineId], date: '2026-12-01' });
    const imports = importBatchRepository(main.db);
    const source = await imports.get(sample.importId);
    await imports.save({ ...source, template: 'batch-confirmed-arrival-v1', status: 'parsed', committedBy: null, committedAt: null, revision: 1 });
    for (const [index, batch] of edited.entries()) await imports.saveRow(arrivalRow(batch, { importId: sample.importId, rowNo: index + 2 }));

    const paused = gate();
    const commit = makeCommitImport(pauseBatchSave(main.db, { paused, timing: 'after' }));
    const input = { importBatchId: sample.importId, expectedRevision: 1 };
    const arrival = settled(commit(input, sample.buyer));
    let assignment: ReturnType<ReturnType<typeof makeAssignLines>> | undefined;
    try {
      await Promise.race([arrival.result, paused.entered]);
      const action = settled(makeAssignLines(writes(competing.db))({ lineIds: [otherLineId, sample.lineId], buyerUserId: null }, sample.buyer));
      assignment = action.result;
      await expect.poll(() => action.isDone() || blockedOnPostgres(main, applicationName), wait).toBe(true);
    } finally {
      paused.release();
      await Promise.allSettled(assignment === undefined ? [arrival.result] : [arrival.result, assignment]);
    }
    await expect(arrival.result).resolves.toEqual({ importBatchId: sample.importId });
    await expect(assignment).resolves.toEqual({ updated: 2 });
    await expect(commit(input, sample.buyer)).rejects.toMatchObject({ code: 'STATE_CONFLICT', details: { state: 'committed' } });
    expect(await imports.get(sample.importId)).toMatchObject({ status: 'committed', revision: 2 });
    expect(await countAudit(main.db, sample.importId)).toBe(1);
    await assertArrival({ db: main.db, earliest, edited });
  });
}, 15000);

it.skipIf(url === undefined)('确认到货先退回失效原行，再等有效行的订单锁', async () => {
  await withFixture(async ({ main, competing, applicationName, sample }) => {
    const holder = orderLineId(`${sample.id}-z`);
    const lineIds = [sample.lineId, orderLineId(`${sample.id}-other`), holder];
    for (const id of lineIds) await seedLine({ db: main.db, sample, id });
    const edited = await seedArrivalEdit(main.db, { sample, lineIds, date: '2026-12-01' });
    const imports = importBatchRepository(main.db);
    const source = await imports.get(sample.importId);
    await imports.save({ ...source, template: 'batch-confirmed-arrival-v1', status: 'parsed', committedBy: null, committedAt: null, revision: 1 });
    for (const [index, batch] of edited.entries()) {
      const exported = index === 0 ? { ...batch, dateBuyerConfirmed: localDate('2026-11-29') } : batch;
      await imports.saveRow(arrivalRow(exported, { importId: sample.importId, rowNo: index + 2 }));
    }
    const paused = gate();
    const lock = writes(main.db).uow.run(async (tx) => { await tx.orderLines.lock(holder); await paused.hold(); });
    await Promise.race([lock, paused.entered]);
    const input = { importBatchId: sample.importId, expectedRevision: 1 };
    const action = settled(makeCommitImport(writes(competing.db))(input, sample.buyer));
    try {
      await expect.poll(() => action.isDone() || blockedOnPostgres(main, applicationName), wait).toBe(true);
      expect(action.isDone()).toBe(true);
    } finally {
      paused.release();
      await Promise.allSettled([lock, action.result]);
    }
    await expect(action.result).rejects.toMatchObject({ details: { state: 'ARRIVAL_CONFIRM_DATE_CHANGED' } });
    expect(await imports.get(sample.importId)).toMatchObject({ status: 'parsed', revision: 1 });
  });
}, 15000);

async function seedArrivalEdit(db: AppDatabase, { sample, lineIds, date }: {
  readonly sample: Sample; readonly lineIds: readonly ReturnType<typeof orderLineId>[]; readonly date: string;
}): Promise<DeliveryBatch[]> {
  const create = makeCreateBatch(writes(db));
  const batches = deliveryBatchRepository(db);
  const result = [];
  for (const lineId of lineIds) {
    const { batchId } = await create({ lineId, receiverPartyId: sample.factoryId, plannedQty: 5, dateBuyerConfirmed: localDate(date) }, sample.buyer);
    result.push(await batches.get(batchId));
  }
  return result;
}

function arrivalRow(batch: DeliveryBatch, { importId, rowNo }: { readonly importId: Sample['importId']; readonly rowNo: number }): ImportRow {
  return {
    id: entityId(`arrival-row-${batch.id}`), importBatchId: importId, rowNo,
    sheetName: '采购确认到货日', raw: {}, action: 'update', issues: [], targetId: null, skipReason: null,
    parsed: {
      batchId: batch.id, exportedLineId: batch.orderLineId, exportedReceiverPartyId: batch.receiverPartyId, sequence: String(batch.seq),
      exportedDate: { value: batch.dateBuyerConfirmed }, date: { value: '2026-12-02' }, reason: '合成确认延期',
    },
  };
}

async function assertArrival({ db, earliest, edited }: {
  readonly db: AppDatabase; readonly earliest: readonly DeliveryBatch[]; readonly edited: readonly DeliveryBatch[];
}): Promise<void> {
  const lines = orderLineRepository(db);
  const batches = deliveryBatchRepository(db);
  for (const batch of earliest) {
    expect(await lines.get(batch.orderLineId)).toMatchObject({ nextDueBatchId: batch.id, nextDueDate: '2026-11-28' });
  }
  for (const batch of edited) {
    const updated = await batches.getWithRecords(batch.id);
    expect(updated.batch.dateBuyerConfirmed).toBe('2026-12-02');
    expect(updated.dateChanges.filter((entry) => entry.newValue === '2026-12-02')).toHaveLength(1);
    expect(await countAudit(db, batch.id)).toBe(2);
  }
}

function pauseBatchSave(db: AppDatabase, { paused, timing }: { readonly paused: ReturnType<typeof gate>; readonly timing: 'before' | 'after' }) {
  const write = writes(db);
  const uow: typeof write.uow = {
    run: (fn) => write.uow.run((tx) => fn({
      ...tx,
      batches: {
        ...tx.batches,
        async saveWithRecordsConditional(records, before) {
          const save = tx.batches.saveWithRecordsConditional;
          if (save === undefined) throw new Error('测试仓储缺少真实条件写入');
          if (timing === 'before' && !paused.hasEntered()) await paused.hold();
          const isSaved = await save(records, before);
          if (timing === 'after' && !paused.hasEntered()) await paused.hold();
          return isSaved;
        },
      },
    })),
  };
  return { ...write, uow };
}
