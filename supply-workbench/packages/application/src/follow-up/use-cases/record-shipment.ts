import { addShipment } from '@sw/domain';
import type { RecordShipment, RecordShipmentDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { commandContext, persistBatch } from './persist-batch.js';

export const makeRecordShipment =
  (deps: RecordShipmentDeps): RecordShipment =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    if (input.fulfillment?.kind === 'verified' && input.shippedOn > deps.clock.today()) {
      throw new ValidationFailedError('实发日期不能晚于业务日期');
    }
    const at = deps.clock.now();
    const shipmentId = deps.ids.next();
    await deps.uow.run(async (tx) => {
      const loaded = await tx.batches.lockWithRecords(input.batchId);
      const next = addShipment({ records: loaded, input: { qty: input.qty, shippedOn: input.shippedOn, note: input.note ?? null, ...(input.fulfillment === undefined ? {} : { fulfillment: input.fulfillment }) }, ctx: commandContext({ actor, at, nextId: shipmentId }) });
      await persistBatch({ tx, records: next, dateChanges: loaded.dateChanges });
      await tx.audit.record(auditOf({ action: input.fulfillment?.kind === 'reported' ? 'shipment.report' : 'shipment.create', subject: { id: shipmentId }, ctx: { actor, at, entity: '发货记录' } }));
    });
    return { shipmentId };
  };
