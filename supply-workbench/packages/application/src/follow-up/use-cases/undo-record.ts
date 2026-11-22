import { UNDO_WINDOW_SECONDS, undoRecord, type EntityId } from '@sw/domain';
import type { UndoRecord, UndoRecordDeps } from '../boundary.js';
import type { UndoRecordInput } from '../views.js';
import type { Actor } from '../../shared/actor.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { UndoNotOwnerError, UndoWindowExpiredError } from '../../shared/errors.js';
import { NotFoundError } from '../../shared/errors.js';
import { commandContext, persistBatch } from './persist-batch.js';

const MS_PER_SECOND = 1000;

export const makeUndoRecord =
  (deps: UndoRecordDeps): UndoRecord =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      if (input.kind === 'follow_up') return undoFollowUp(tx, { id: input.recordId, actor, at });
      if (input.kind === 'exception') return undoException(tx, { id: input.recordId, actor, at });
      await undoBatchRecord(tx, { input, actor, at, nextId: deps.ids.next() });
    });
  };

async function undoBatchRecord(tx: UnitOfWorkStores, ctx: { readonly input: UndoRecordInput; readonly actor: Actor; readonly at: string; readonly nextId: EntityId }): Promise<void> {
  if (ctx.input.kind === 'follow_up' || ctx.input.kind === 'exception') return;
  const batchId = await tx.batches.findBatchIdOf(ctx.input.kind, ctx.input.recordId);
  if (batchId === undefined) throw new NotFoundError('记录', ctx.input.recordId);
  const loaded = await tx.batches.lockWithRecords(batchId);
  const next = undoRecord(loaded, { kind: ctx.input.kind, recordId: ctx.input.recordId, ctx: commandContext({ actor: ctx.actor, at: ctx.at, nextId: ctx.nextId }) });
  await persistBatch({ tx, records: next, dateChanges: loaded.dateChanges });
  await tx.audit.record(auditOf({ action: 'record.undo', subject: { id: ctx.input.recordId }, ctx: { actor: ctx.actor, at: ctx.at, entity: ctx.input.kind } }));
}

async function undoFollowUp(tx: UnitOfWorkStores, ctx: { readonly id: string; readonly actor: Actor; readonly at: string }): Promise<void> {
  const row = await tx.followUps.get(ctx.id);
  assertOwnerWindow({ createdBy: row.createdBy, createdAt: row.createdAt, ctx });
  await tx.followUps.remove(ctx.id);
  await tx.audit.record(auditOf({ action: 'follow_up.undo', subject: row, ctx: { actor: ctx.actor, at: ctx.at, before: row, after: null, entity: '跟进记录' } }));
}

async function undoException(tx: UnitOfWorkStores, ctx: { readonly id: string; readonly actor: Actor; readonly at: string }): Promise<void> {
  const row = await tx.exceptions.get(ctx.id);
  assertOwnerWindow({ createdBy: row.openedBy, createdAt: row.createdAt, ctx });
  await tx.exceptions.remove(ctx.id);
  await tx.audit.record(auditOf({ action: 'exception.undo', subject: row, ctx: { actor: ctx.actor, at: ctx.at, before: row, after: null, entity: '异常' } }));
}

function assertOwnerWindow({ createdBy, createdAt, ctx }: { readonly createdBy: string; readonly createdAt: string; readonly ctx: { readonly actor: Actor; readonly at: string } }): void {
  if (createdBy !== ctx.actor.id) throw new UndoNotOwnerError();
  const elapsed = (Date.parse(ctx.at) - Date.parse(createdAt)) / MS_PER_SECOND;
  if (!Number.isFinite(elapsed) || elapsed > UNDO_WINDOW_SECONDS) throw new UndoWindowExpiredError();
}
