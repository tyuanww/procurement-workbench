import type { ExceptionRecord } from '@sw/domain';
import type { CloseException, CloseExceptionDeps } from '../boundary.js';
import type { Actor } from '../../shared/actor.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { StateConflictError } from '../../shared/errors.js';

export const makeCloseException =
  (deps: CloseExceptionDeps): CloseException =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    await deps.uow.run(async (tx) => {
      const before = await tx.exceptions.get(input.exceptionId);
      const after = closed(before, { closeNote: input.closeNote.trim(), actor, at });
      await tx.exceptions.save(after);
      await tx.audit.record(
        auditOf({ action: 'exception.close', subject: after, ctx: { actor, at, before, after, entity: '异常' } }),
      );
    });
    return { exceptionId: input.exceptionId };
  };

function closed(
  before: ExceptionRecord,
  ctx: { readonly closeNote: string; readonly actor: Actor; readonly at: string },
): ExceptionRecord {
  if (before.status !== 'open') throw new StateConflictError(before.status);
  return {
    ...before,
    status: 'closed',
    closedBy: ctx.actor.id,
    closedAt: ctx.at,
    closeNote: ctx.closeNote,
    updatedAt: ctx.at,
  };
}
