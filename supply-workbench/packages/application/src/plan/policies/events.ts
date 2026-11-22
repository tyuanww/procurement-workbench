import type { EntityId } from '../../../../domain/src/values/ids.js';
import type { WorkItem, WorkItemEvent, WorkItemEventKind } from '../../../../domain/src/entities/work-items.js';

export type NewEventInput = {
  readonly id: EntityId;
  readonly workItemId: EntityId;
  readonly kind: WorkItemEventKind;
  readonly field: string | null;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly actorUserId: EntityId;
  readonly note: string | null;
  readonly createdAt: string;
};

export function newWorkItemEvent(input: NewEventInput): WorkItemEvent {
  return {
    id: input.id,
    workItemId: input.workItemId,
    kind: input.kind,
    field: input.field,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    actorUserId: input.actorUserId,
    note: input.note,
    createdAt: input.createdAt,
  };
}

/** created 事件的 newValue：一眼能看出这条项是什么。 */
export function workItemSnapshot(item: WorkItem): Readonly<Record<string, unknown>> {
  return {
    subjectType: item.subjectType,
    subjectId: item.subjectId,
    kind: item.kind,
    title: item.title,
    ownerUserId: item.ownerUserId,
    counterpartyPartyId: item.counterpartyPartyId,
    counterpartyRole: item.counterpartyRole,
    plannedStart: item.plannedStart,
    plannedEnd: item.plannedEnd,
    status: item.status,
    priority: item.priority,
    source: item.source,
    parentId: item.parentId,
  };
}
