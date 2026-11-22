import { applyConfirmedDate, isNotProvided, normalizeUnit, updateBatchFields } from '@sw/domain';
import type { UpdateBatch, UpdateBatchDeps } from '../boundary.js';
import type { UpdateBatchInput } from '../views.js';
import type { BatchWithRecords } from '../../ports/delivery-batch-repository.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { commandContext, persistBatch } from './persist-batch.js';

type PatchContext = {
  readonly actor: import('../../shared/actor.js').Actor;
  readonly at: string;
  readonly dateId: import('@sw/domain').EntityId;
  readonly fieldId: import('@sw/domain').EntityId;
};

export const makeUpdateBatch =
  (deps: UpdateBatchDeps): UpdateBatch =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const loaded = await tx.batches.lockWithRecords(input.batchId);
      await updateLockedBatch({ tx, loaded, input, ctx: { actor, at, dateId: deps.ids.next(), fieldId: deps.ids.next() } });
    });
    return { batchId: input.batchId };
  };

export async function updateLockedBatch({ tx, loaded, input, ctx }: {
  readonly tx: UnitOfWorkStores;
  readonly loaded: BatchWithRecords;
  readonly input: UpdateBatchInput;
  readonly ctx: PatchContext;
}): Promise<void> {
  authorize(ctx.actor, 'records.write');
  const changed = applyPatch({ loaded, input, ctx });
  await persistBatch({ tx, records: changed.records, dateChanges: changed.dateChanges, expectedUpdatedAt: loaded.batch.updatedAt });
  const batch = changed.records.batch;
  const after = input.plannedUnit === undefined ? batch : { ...batch, reason: input.reason };
  await tx.audit.record(auditOf({ action: 'batch.update', subject: batch, ctx: { actor: ctx.actor, at: ctx.at, before: loaded.batch, after, entity: '要货批次' } }));
}

function applyPatch({ loaded, input, ctx }: { readonly loaded: BatchWithRecords; readonly input: UpdateBatchInput; readonly ctx: PatchContext }) {
  let records = { batch: loaded.batch, shipments: loaded.shipments, receipts: loaded.receipts, deliveryNote: loaded.deliveryNote };
  let dateChanges = loaded.dateChanges;
  if (input.dateBuyerConfirmed !== undefined) {
    const dated = applyConfirmedDate(records, { date: input.dateBuyerConfirmed, reason: input.reason ?? null, ctx: commandContext({ actor: ctx.actor, at: ctx.at, nextId: ctx.dateId }) });
    records = { ...records, batch: dated.batch };
    if (dated.dateChange !== null) dateChanges = [...dateChanges, dated.dateChange];
  }
  const patch = fieldPatch(input);
  if (Object.keys(patch).length > 0) {
    const fields = updateBatchFields({ batch: records.batch, patch, records: { ...records, at: ctx.at, by: ctx.actor.id, nextId: ctx.fieldId } });
    records = { ...records, batch: fields.batch };
    if (fields.dateChange !== null) dateChanges = [...dateChanges, fields.dateChange];
  }
  return { records, dateChanges };
}

function fieldPatch(input: UpdateBatchInput) {
  return {
    ...(input.plannedQty === undefined ? {} : { plannedQty: input.plannedQty }),
    ...plannedUnitPatch(input),
    ...(input.receiverPartyId === undefined ? {} : { receiverPartyId: input.receiverPartyId }),
    ...(input.dateSupplierPromised === undefined ? {} : { dateSupplierPromised: input.dateSupplierPromised }),
    ...(input.dateFactoryRequired === undefined ? {} : { dateFactoryRequired: input.dateFactoryRequired }),
  };
}

function plannedUnitPatch({ plannedUnit, reason }: UpdateBatchInput): { readonly plannedUnit?: string } {
  if (plannedUnit === undefined) return {};
  const unit = normalizeUnit(plannedUnit);
  if (unit === null || reason === undefined || isNotProvided(reason)) {
    throw new ValidationFailedError('请填写计划单位和可回查依据');
  }
  return { plannedUnit: unit };
}
