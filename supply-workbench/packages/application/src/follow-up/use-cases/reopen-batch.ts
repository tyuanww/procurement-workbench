import { reopenBatch } from '@sw/domain';
import type { ReopenBatch, ReopenBatchDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { commandContext, persistBatch } from './persist-batch.js';

export const makeReopenBatch =
  (deps: ReopenBatchDeps): ReopenBatch =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const loaded = await tx.batches.lockWithRecords(input.batchId);
      const batch = reopenBatch(loaded, { reason: input.reason, ctx: commandContext({ actor, at, nextId: deps.ids.next() }) });
      await persistBatch({ tx, records: { ...loaded, batch }, dateChanges: loaded.dateChanges });
      await tx.audit.record(auditOf({ action: 'batch.reopen', subject: batch, ctx: { actor, at, before: loaded.batch, after: batch, entity: '要货批次' } }));
    });
    return { batchId: input.batchId };
  };
