import type { EntityId, ExceptionRecord } from '@sw/domain';
import type { OpenException, OpenExceptionDeps } from '../boundary.js';
import type { OpenExceptionInput } from '../views.js';
import type { Actor } from '../../shared/actor.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { assertLineRefs, requiredText } from './line-ref.js';

export const makeOpenException =
  (deps: OpenExceptionDeps): OpenException =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const note = requiredText(input.note, 'note');
    const at = deps.clock.now();
    const exceptionId = deps.ids.next();
    await deps.uow.run(async (tx) => {
      await assertLineRefs(tx, input);
      const row = opened({ id: exceptionId, input, note, actor, at });
      await tx.exceptions.save(row);
      await tx.audit.record(auditOf({ action: 'exception.open', subject: row, ctx: { actor, at, entity: '异常' } }));
    });
    return { exceptionId };
  };

function opened(ctx: {
  readonly id: EntityId;
  readonly input: OpenExceptionInput;
  readonly note: string;
  readonly actor: Actor;
  readonly at: string;
}): ExceptionRecord {
  return {
    id: ctx.id,
    createdAt: ctx.at,
    updatedAt: ctx.at,
    orderLineId: ctx.input.orderLineId,
    batchId: ctx.input.batchId ?? null,
    type: ctx.input.type,
    note: ctx.note,
    status: 'open',
    openedBy: ctx.actor.id,
    closedBy: null,
    closedAt: null,
    closeNote: null,
  };
}
