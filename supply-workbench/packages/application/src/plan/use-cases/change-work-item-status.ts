import { authorize } from '../../shared/authorize.js';
import type { ChangeWorkItemStatus, ChangeWorkItemStatusDeps } from '../boundary.js';
import { newWorkItemEvent } from '../policies/events.js';
import { ForbiddenError, StateConflictError } from '../../shared/errors.js';
import { assertWorkItemTransition } from '../policies/state-machine.js';
import { auditOf } from '../../shared/audit.js';

export const makeChangeWorkItemStatus =
  (deps: ChangeWorkItemStatusDeps): ChangeWorkItemStatus =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    return deps.uow.run(async (tx) => {
      const current = await tx.workItems.get(input.workItemId);
      if (current.subjectType === 'product_development') throw new ForbiddenError('product-development.manage');
      assertWorkItemTransition(current.status, input.status);
      const next = { ...current, status: input.status, updatedAt: at, version: current.version + 1 };
      if (!(await tx.workItems.saveConditional(next, current.version))) throw new StateConflictError(`version ${current.version} 已被并发修改`);
      await tx.workItemEvents.append(newWorkItemEvent({
        id: deps.ids.next(),
        workItemId: current.id,
        kind: 'status_changed',
        field: 'status',
        oldValue: current.status,
        newValue: input.status,
        actorUserId: actor.id,
        note: input.note ?? null,
        createdAt: at,
      }));
      await tx.audit.record(auditOf({ action: 'work_item.status', subject: next, ctx: { actor, at, before: current, after: next, entity: '排期任务' } }));
      return { workItemId: current.id, version: next.version };
    });
  };
