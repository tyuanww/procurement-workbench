import { createBatch } from '@sw/domain';
import type { CreateBatch, CreateBatchDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { StateConflictError } from '../../shared/errors.js';
import { commandContext, persistBatch } from './persist-batch.js';

export const makeCreateBatch =
  (deps: CreateBatchDeps): CreateBatch =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    const batchId = deps.ids.deliveryBatch();
    await deps.uow.run(async (tx) => {
      const line = await tx.orderLines.lock(input.lineId);
      if (line.cancelledAt !== null) throw new StateConflictError(line.stage);
      const existing = await tx.batches.listByOrderLine(input.lineId);
      if (input.firstBatchOnly === true && existing.length > 0) throw new StateConflictError('first_batch.exists');
      const seq = nextSeq(existing);
      const batch = createBatch({
        orderLineId: input.lineId,
        seq,
        plannedQty: input.plannedQty,
        plannedUnit: line.unit,
        receiverPartyId: input.receiverPartyId,
        dateBuyerConfirmed: input.dateBuyerConfirmed ?? null,
        dateSupplierPromised: input.dateSupplierPromised ?? null,
        dateFactoryRequired: input.dateFactoryRequired ?? null,
        origin: 'manual',
      }, commandContext({ actor, at, nextId: batchId }));
      await persistBatch({ tx, records: { batch, shipments: [], receipts: [], deliveryNote: null }, dateChanges: [] });
      await tx.audit.record(auditOf({ action: 'batch.create', subject: batch, ctx: { actor, at, entity: '要货批次' } }));
    });
    return { batchId };
  };

function nextSeq(batches: readonly { readonly seq: number }[]): number {
  let seq = 0;
  for (const batch of batches) if (batch.seq > seq) seq = batch.seq;
  return seq + 1;
}
