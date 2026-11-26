import { addReceipt, normalizeUnit, type Receipt, type ReceiptEvidenceInput } from '@sw/domain';
import type { RecordReceipt, RecordReceiptDeps } from '../boundary.js';
import type { RecordReceiptInput } from '../views.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { StateConflictError, ValidationFailedError } from '../../shared/errors.js';
import { commandContext, persistBatch } from './persist-batch.js';

const AUDIT_FIELDS = { action: 'receipt.create', entity: '收货记录' };

export const makeRecordReceipt =
  (deps: RecordReceiptDeps): RecordReceipt =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    if (input.fulfillment !== undefined && input.receivedOn > deps.clock.today()) {
      throw new ValidationFailedError('实收日期不能晚于业务日期');
    }
    const at = deps.clock.now();
    const receiptId = input.attemptReceiptId ?? deps.ids.next();
    await deps.uow.run(async (tx) => {
      const loaded = await tx.batches.lockWithRecords(input.batchId);
      if (input.attemptReceiptId !== undefined) {
        const previous = loaded.receipts.find((row) => row.id === receiptId);
        if (previous !== undefined) {
          if (previous.createdBy !== actor.id || !matchesReceipt(previous, input)) throw new StateConflictError('receipt.attempt');
          return;
        }
        if (await tx.audit.hasEntry({ ...AUDIT_FIELDS, actorUserId: actor.id, entityId: receiptId })) {
          throw new StateConflictError('receipt.attempt_undone');
        }
      }
      const next = addReceipt({ records: loaded, input, ctx: commandContext({ actor, at, nextId: receiptId }) });
      await persistBatch({ tx, records: next, dateChanges: loaded.dateChanges });
      await tx.audit.record(auditOf({ action: AUDIT_FIELDS.action, subject: { id: receiptId }, ctx: { actor, at, entity: AUDIT_FIELDS.entity } }));
    });
    return { receiptId };
  };

function matchesReceipt(previous: Receipt, input: RecordReceiptInput): boolean {
  return previous.voidedAt === null && previous.qty === input.qty && previous.receivedOn === input.receivedOn
    && previous.category === input.category && previous.note === (input.note ?? null)
    && matchesEvidence(previous.fulfillment, input.fulfillment);
}

function matchesEvidence(previous: Receipt['fulfillment'], input: ReceiptEvidenceInput | undefined): boolean {
  if (previous == null || input === undefined) return previous == null && input === undefined;
  return previous.kind === input.kind && previous.unit === normalizeUnit(input.unit)
    && previous.evidence === input.evidence.trim() && previous.disposition === input.disposition;
}
