import { addShipment, type LocalDate } from '@sw/domain';
import type { AdoptFactoryShipment, AdoptFactoryShipmentDeps } from '../boundary.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { StateConflictError, ValidationFailedError } from '../../shared/errors.js';
import { commandContext, persistBatch } from './persist-batch.js';

export const makeAdoptFactoryShipment =
  (deps: AdoptFactoryShipmentDeps): AdoptFactoryShipment =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    const shipmentId = deps.ids.next();
    await deps.uow.run(async (tx) => {
      const row = await tx.factoryReports.get(input.rowId);
      const facts = shipmentFacts({ kind: row.kind, qty: input.qty ?? row.shipment?.qty ?? null, shippedOn: input.shippedOn ?? row.shipment?.shipOrArriveOn ?? null }
      );
      const loaded = await tx.batches.lockWithRecords(input.batchId);
      if ((await tx.batches.findAdoptedShipment(row.id)) !== undefined)
        throw new StateConflictError('adopted');
      const next = addShipment({ records: loaded, input: { ...facts, source: 'factory_report_adopted', factoryShipmentRowId: row.id }, ctx: commandContext({ actor, at, nextId: shipmentId }) }
      );
      await persistBatch({ tx, records: next, dateChanges: loaded.dateChanges });
      await tx.audit.record(
        auditOf({ action: 'shipment.adopt', subject: { id: shipmentId }, ctx: { actor, at, entity: '发货记录' } }),
      );
    });
    return { shipmentId };
  };

function shipmentFacts({ kind, qty, shippedOn }: { readonly kind: string; readonly qty: number | null; readonly shippedOn: LocalDate | null }): { readonly qty: number; readonly shippedOn: LocalDate } {
  if (kind !== 'shipment') throw new StateConflictError(kind);
  if (qty === null || shippedOn === null)
    throw new ValidationFailedError('出货行没有数量或日期', {
      field: qty === null ? 'qty' : 'shippedOn',
    });
  if (!Number.isFinite(qty) || qty <= 0)
    throw new ValidationFailedError('数量必须大于 0', { field: 'qty' });
  return { qty, shippedOn };
}
