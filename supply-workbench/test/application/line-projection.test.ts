import { deliveryBatchId, entityId, type DeliveryBatchId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { NotFoundError } from '../../packages/application/src/shared/errors.js';
import { refreshLineProjection } from '../../packages/application/src/shared/line-projection.js';
import { addReceipt, addShipment, applyConfirmedDate, createBatch, type RuleContext } from '../../packages/domain/src/batch/change.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import { anOrderLine, createMemory } from '../../packages/testkit/src/index.js';

const day = localDate;
const at = '2026-10-12T00:00:00.000Z';

function ctx(over: Partial<RuleContext<DeliveryBatchId>> = {}): RuleContext<DeliveryBatchId> {
  return { at, by: entityId('buyer-1'), isAdmin: false, nextId: deliveryBatchId('batch-1'), ...over };
}

it('加批次、确认日期、发货、收货后，订单行冗余字段跟着变', async () => {
  const memory = createMemory();
  const line = anOrderLine();
  const other = anOrderLine();
  await memory.stores.orderLines.save(line);
  await memory.stores.orderLines.save(other);
  const created = createBatch({
    orderLineId: line.id, seq: 1, plannedQty: 10, receiverPartyId: entityId('recv-1'), origin: 'manual',
  }, ctx());
  await memory.stores.batches.save(created);
  expect(await projected(memory, line.id)).toMatchObject({
    stage: 'awaiting_date',
    stageChangedAt: created.statusChangedAt,
    nextDueBatchId: created.id,
    nextDueDate: null,
  });
  const confirmed = applyConfirmedDate(
    { batch: created, shipments: [], receipts: [] },
    { date: day('2026-10-20'), reason: null, ctx: ctx({ nextId: deliveryBatchId('chg-1') }) },
  ).batch;
  await memory.stores.batches.save(confirmed);
  expect(await projected(memory, line.id)).toMatchObject({ stage: 'awaiting_shipment', nextDueDate: day('2026-10-20') });
  const shipped = addShipment({ records: { batch: confirmed, shipments: [], receipts: [], deliveryNote: null }, input: { qty: 1, shippedOn: day('2026-10-18') }, ctx: ctx({ nextId: deliveryBatchId('ship-1') }) }
  );
  await memory.stores.batches.save(shipped.batch);
  expect((await projected(memory, line.id)).stage).toBe('awaiting_receipt');
  const partial = addReceipt({ records: shipped, input: { qty: 4, receivedOn: day('2026-10-19'), category: 'finished' }, ctx: ctx({ nextId: deliveryBatchId('r1') }) });
  await memory.stores.batches.save(partial.batch);
  expect((await projected(memory, line.id)).stage).toBe('partially_received');
  expect((await projected(memory, other.id)).stage).toBe('no_batch');
  await expect(memory.unitOfWork.run((tx) => refreshLineProjection(tx, ['missing']))).rejects.toBeInstanceOf(NotFoundError);
});

function projected(memory: ReturnType<typeof createMemory>, lineId: string) {
  return memory.unitOfWork.run(async (tx) => {
    await refreshLineProjection(tx, [lineId]);
    return tx.orderLines.get(lineId);
  });
}
