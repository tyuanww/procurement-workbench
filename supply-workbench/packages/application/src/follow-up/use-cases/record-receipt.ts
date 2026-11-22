import { addReceipt } from '@sw/domain';
import type { RecordReceipt, RecordReceiptDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { commandContext, persistBatch } from './persist-batch.js';

export const makeRecordReceipt =
  (deps: RecordReceiptDeps): RecordReceipt =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    if (input.fulfillment !== undefined && input.receivedOn > deps.clock.today()) {
      throw new ValidationFailedError('实收日期不能晚于业务日期');
    }
    const at = deps.clock.now();
    const receiptId = deps.ids.next();
    await deps.uow.run(async (tx) => {
      const loaded = await tx.batches.lockWithRecords(input.batchId);
      const next = addReceipt({ records: loaded, input: { qty: input.qty, receivedOn: input.receivedOn, category: input.category, note: input.note ?? null, ...(input.fulfillment === undefined ? {} : { fulfillment: input.fulfillment }) }, ctx: commandContext({ actor, at, nextId: receiptId }) });
      await persistBatch({ tx, records: next, dateChanges: loaded.dateChanges });
      await tx.audit.record(auditOf({ action: 'receipt.create', subject: { id: receiptId }, ctx: { actor, at, entity: '收货记录' } }));
    });
    return { receiptId };
  };
