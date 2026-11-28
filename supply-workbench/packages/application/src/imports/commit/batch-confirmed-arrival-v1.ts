import { entityId } from '@sw/domain';
import { updateLockedBatch } from '../../follow-up/index.js';
import { authorize } from '../../shared/authorize.js';
import { DateChangeReasonRequiredError, NotFoundError, StateConflictError, ValidationFailedError } from '../../shared/errors.js';
import { confirmationDecision, confirmationOf } from '../confirmed-arrival.js';
import type { CommitContext, CommitResult } from './context.js';

export async function commitConfirmedArrival(ctx: CommitContext): Promise<CommitResult> {
  authorize(ctx.actor, 'records.write');
  const pending = ctx.rows.filter((row) => row.action === 'update' || row.action === 'unchanged').map((row) => {
    const confirmation = confirmationOf(row.parsed);
    if (confirmation === null) throw new ValidationFailedError('确认日行已经失效，请重新导出核对');
    return { row, confirmation };
  }).sort((a, b) => compareIds(a.confirmation.batchId, b.confirmation.batchId));
  const locked = [];
  for (const item of pending) {
    const loaded = await lockBatch(ctx, item.confirmation.batchId);
    locked.push({ ...item, loaded, decision: confirmationDecision(loaded.batch, item.confirmation) });
  }
  locked.sort((a, b) => compareIds(a.loaded.batch.orderLineId, b.loaded.batch.orderLineId));
  const writtenLines = new Set(locked
    .filter((item) => item.row.action === 'update' && item.decision === 'update')
    .map((item) => item.loaded.batch.orderLineId));
  if (writtenLines.size > 1) {
    for (const lineId of writtenLines) await ctx.tx.orderLines.lock(lineId, { noWait: true });
  }
  for (const item of locked) await confirm({ ctx, ...item });
  return { affectedLineIds: [], presentLineIds: [] };
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

async function lockBatch(ctx: CommitContext, id: string) {
  try {
    return await ctx.tx.batches.lockWithRecords(id);
  } catch (error) {
    if (error instanceof NotFoundError) throw new StateConflictError('ARRIVAL_BATCH_NOT_FOUND');
    throw error;
  }
}

async function confirm({ ctx, row, confirmation, loaded, decision }: {
  readonly ctx: CommitContext;
  readonly row: CommitContext['rows'][number];
  readonly confirmation: NonNullable<ReturnType<typeof confirmationOf>>;
  readonly loaded: Awaited<ReturnType<CommitContext['tx']['batches']['lockWithRecords']>>;
  readonly decision: ReturnType<typeof confirmationDecision>;
}): Promise<void> {
  if (decision === 'unchanged') {
    if (row.action !== 'unchanged') await ctx.tx.imports.saveRow({ ...row, action: 'unchanged' });
    return;
  }
  if (decision === 'ARRIVAL_BATCH_RECEIVER_CHANGED' || decision === 'ARRIVAL_BATCH_IDENTITY_CHANGED') throw new StateConflictError(decision);
  if (row.action === 'unchanged') throw new StateConflictError('ARRIVAL_CONFIRM_DATE_CHANGED');
  if (decision === 'ARRIVAL_CONFIRM_DATE_REASON_MISSING') throw new DateChangeReasonRequiredError();
  if (decision !== 'update') throw new StateConflictError(decision);
  const id = entityId(`confirmed-arrival:${ctx.batch.id}:${row.id}`);
  await updateLockedBatch({
    tx: ctx.tx,
    loaded,
    input: { batchId: confirmation.batchId, dateBuyerConfirmed: confirmation.date, ...(confirmation.reason === null ? {} : { reason: confirmation.reason }) },
    ctx: { actor: ctx.actor, at: ctx.at, dateId: id, fieldId: id },
  });
}
