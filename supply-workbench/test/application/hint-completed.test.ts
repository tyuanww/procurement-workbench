import { expect, it } from 'vitest';
import { makeCreateHintBatches } from '../../packages/application/src/follow-up/use-cases/create-hint-batches.js';
import {DEFAULT_SETTINGS, entityId, orderLineId} from '../../packages/domain/src/index.js';
import { anActor, anOrderLine, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';

it('未要求包含已完成时，总表已完成的订单行不生成首批', async () => {
  const memory = createMemory();
  await memory.stores.settings.save({ ...DEFAULT_SETTINGS, ownWarehousePartyId: entityId('warehouse-1') });
  const line = anOrderLine({ id: orderLineId('line-done'), qtyOrdered: 10, currentSnapshotId: entityId('snap-1') });
  await memory.stores.orderLines.save(line);
  await memory.stores.orderLines.saveSnapshot({
    id: entityId('snap-1'),
    orderLineId: line.id,
    importBatchId: entityId('batch-1'),
    importRowId: entityId('row-1'),
    data: { statusReported: { raw: '已完成', value: '已完成' } },
  });
  const hint = makeCreateHintBatches({ uow: memory.unitOfWork, clock: new FixedClock('2026-10-12T00:00:00.000Z'), ids: new SequentialIds() });
  const skipped = await hint({ lineIds: [line.id], includeCompleted: false }, anActor('buyer'));
  expect(skipped).toEqual({ created: 0, skipped: [{ lineId: line.id, reason: '总表状态已完成' }] });
  const included = await hint({ lineIds: [line.id], includeCompleted: true }, anActor('buyer'));
  expect(included.created).toBe(1);
});
