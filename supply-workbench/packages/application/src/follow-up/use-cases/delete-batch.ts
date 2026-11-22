import { assertBatchDeletable } from '@sw/domain';
import type { DeleteBatch, DeleteBatchDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { refreshLineProjection } from '../../shared/line-projection.js';

export const makeDeleteBatch =
  (deps: DeleteBatchDeps): DeleteBatch =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const loaded = await tx.batches.lockWithRecords(input.batchId);
      assertBatchDeletable(loaded);
      await tx.batches.remove(input.batchId);
      await refreshLineProjection(tx, [loaded.batch.orderLineId]);
      await tx.audit.record(auditOf({ action: 'batch.delete', subject: loaded.batch, ctx: { actor, at, before: loaded.batch, after: null, entity: '要货批次' } }));
    });
  };
