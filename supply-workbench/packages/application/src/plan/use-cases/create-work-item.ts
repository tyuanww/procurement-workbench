import type { WorkItem } from '../../../../domain/src/entities/work-items.js';
import { compareDates } from '../../../../domain/src/dates.js';
import type { EntityId } from '../../../../domain/src/values/ids.js';
import { authorize } from '../../shared/authorize.js';
import { ForbiddenError, ValidationFailedError } from '../../shared/errors.js';
import { auditOf } from '../../shared/audit.js';
import type { CreateWorkItem, CreateWorkItemDeps } from '../boundary.js';
import type { CreateWorkItemInput } from '../views.js';
import { newWorkItemEvent, workItemSnapshot } from '../policies/events.js';

export const makeCreateWorkItem =
  (deps: CreateWorkItemDeps): CreateWorkItem =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    const id = deps.ids.next();
    const entity = draftOf({ input, id, at });
    await deps.uow.run(async (tx) => {
      await tx.workItems.save(entity);
      await tx.workItemEvents.append(newWorkItemEvent({
        id: deps.ids.next(),
        workItemId: id,
        kind: 'created',
        field: null,
        oldValue: null,
        newValue: workItemSnapshot(entity),
        actorUserId: actor.id,
        note: null,
        createdAt: at,
      }));
      await tx.audit.record(auditOf({ action: 'work_item.create', subject: entity, ctx: { actor, at, entity: '排期任务' } }));
    });
    return { workItemId: id };
  };

function draftOf({ input, id, at }: { readonly input: CreateWorkItemInput; readonly id: EntityId; readonly at: string }): WorkItem {
  assertCreateInput(input);
  if (input.subjectType === 'product_development') throw new ForbiddenError('product-development.create-node');
  return {
    id,
    createdAt: at,
    updatedAt: at,
    subjectType: input.subjectType,
    subjectId: input.subjectType === 'standalone' ? null : input.subjectId ?? null,
    kind: input.kind,
    title: input.title.trim(),
    ownerUserId: input.ownerUserId ?? null,
    counterpartyPartyId: input.counterpartyPartyId ?? null,
    counterpartyRole: input.counterpartyRole ?? null,
    plannedStart: input.plannedStart,
    plannedEnd: input.plannedEnd,
    status: 'planned',
    priority: input.priority ?? 'normal',
    source: 'manual',
    parentId: input.parentId ?? null,
    version: 0,
  };
}

function assertCreateInput(input: CreateWorkItemInput): void {
  if (input.title.trim() === '') throw new ValidationFailedError('排期项标题不能为空');
  if (input.subjectType !== 'standalone' && (input.subjectId === undefined || input.subjectId === null)) {
    throw new ValidationFailedError('挂订单行或批次的排期项要指定 subjectId');
  }
  if (compareDates(input.plannedStart, input.plannedEnd) > 0) {
    throw new ValidationFailedError('计划开始日不能晚于结束日');
  }
}
