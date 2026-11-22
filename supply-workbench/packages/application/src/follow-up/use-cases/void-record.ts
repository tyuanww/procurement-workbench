import { voidRecord } from '@sw/domain';
import type { VoidRecord, VoidRecordDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { NotFoundError } from '../../shared/errors.js';
import { commandContext, persistBatch } from './persist-batch.js';

export const makeVoidRecord =
  (deps: VoidRecordDeps): VoidRecord =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const batchId = await tx.batches.findBatchIdOf(input.kind, input.recordId);
      if (batchId === undefined) throw new NotFoundError('记录', input.recordId);
      const loaded = await tx.batches.lockWithRecords(batchId);
      const next = voidRecord(loaded, { kind: input.kind, recordId: input.recordId, reason: input.reason, ctx: commandContext({ actor, at, nextId: deps.ids.next() }) });
      await persistBatch({ tx, records: next, dateChanges: loaded.dateChanges });
      await tx.audit.record(auditOf({ action: 'record.void', subject: { id: input.recordId }, ctx: { actor, at, entity: input.kind } }));
    });
    return { recordId: input.recordId };
  };
