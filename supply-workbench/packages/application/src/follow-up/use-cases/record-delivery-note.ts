import { parseEntityId, setDeliveryNote } from '@sw/domain';
import type { RecordDeliveryNote, RecordDeliveryNoteDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { commandContext, persistBatch } from './persist-batch.js';

export const makeRecordDeliveryNote =
  (deps: RecordDeliveryNoteDeps): RecordDeliveryNote =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    const deliveryNoteId = deps.ids.next();
    const stored = input.file === undefined ? null : await deps.files.put({ bytes: input.file.bytes, originalName: input.file.fileName, mime: input.file.mime });
    const fileId = stored === null ? null : fileEntityId(stored.sha256);
    await deps.uow.run(async (tx) => {
      const loaded = await tx.batches.lockWithRecords(input.batchId);
      const next = setDeliveryNote({ records: loaded, input: { status: input.status, date: input.date, note: input.note ?? null, fileId }, ctx: commandContext({ actor, at, nextId: deliveryNoteId }) });
      await persistBatch({ tx, records: next, dateChanges: loaded.dateChanges });
      await tx.audit.record(auditOf({ action: 'delivery_note.create', subject: { id: deliveryNoteId }, ctx: { actor, at, entity: '送货单' } }));
    });
    return { deliveryNoteId };
  };

function fileEntityId(sha256: string) {
  const parsed = parseEntityId(sha256);
  if (!parsed.ok) throw new Error('文件 id 为空');
  return parsed.value;
}
