import { orderLineId, PROCUREMENT_SCHEDULE_STAGES, procurementStageId, PROCUREMENT_STAGE_LABELS, type ProcurementScheduleStage } from '@sw/domain';
import type { PlanStores } from '../ports.js';
import type { WorkItem } from '../../../../domain/src/entities/work-items.js';
import type { WorkItemEventKind } from '../../../../domain/src/entities/work-items.js';
import { compareDates } from '../../../../domain/src/dates.js';
import { authorize } from '../../shared/authorize.js';
import { ForbiddenError, StateConflictError, ValidationFailedError } from '../../shared/errors.js';
import type { UpdateWorkItem, UpdateWorkItemDeps } from '../boundary.js';
import type { UpdateWorkItemInput } from '../views.js';
import { newWorkItemEvent } from '../policies/events.js';
import { auditOf } from '../../shared/audit.js';

type Change = {
  readonly kind: WorkItemEventKind;
  readonly field: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
};

export const makeUpdateWorkItem =
  (deps: UpdateWorkItemDeps): UpdateWorkItem =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const at = deps.clock.now();
    return deps.uow.run(async (tx) => {
      const first = await tx.workItems.get(input.workItemId);
      if (first.subjectType === 'product_development') throw new ForbiddenError('product-development.manage');
      const stage = stageOf(first);
      const hasDateChange = input.plannedStart !== undefined || input.plannedEnd !== undefined;
      const isProcurementDateChange = stage !== undefined && hasDateChange;
      if (isProcurementDateChange) await tx.workItemDependencies.lockGraph();
      const current = isProcurementDateChange ? await tx.workItems.get(input.workItemId) : first;
      assertVersion(current, input.expectedVersion);
      const applied = applyUpdate(current, input);
      if (isProcurementDateChange) await assertProcurementDates(tx, { item: applied.item, stage });
      const next = { ...applied.item, updatedAt: at, version: current.version + 1 };
      if (!(await tx.workItems.saveConditional(next, current.version))) throw new StateConflictError(`version ${input.expectedVersion ?? current.version} 已被并发修改`);
      for (const change of applied.changes) {
        await tx.workItemEvents.append(newWorkItemEvent({
          id: deps.ids.next(),
          workItemId: current.id,
          kind: change.kind,
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          actorUserId: actor.id,
          note: null,
          createdAt: at,
        }));
      }
      await tx.audit.record(auditOf({ action: 'work_item.update', subject: next, ctx: { actor, at, before: current, after: next, entity: '排期任务' } }));
      return { workItemId: current.id, version: next.version };
    });
  };

function assertVersion(current: WorkItem, expectedVersion: number | undefined): void {
  if (expectedVersion === undefined || expectedVersion === current.version) return;
  throw new StateConflictError(`version ${expectedVersion} != ${current.version}`);
}

function applyUpdate(current: WorkItem, input: UpdateWorkItemInput): { readonly item: WorkItem; readonly changes: readonly Change[] } {
  const dates = nextDates(current, input);
  const item: WorkItem = {
    ...current,
    title: input.title === undefined ? current.title : requiredTitle(input.title),
    ownerUserId: input.ownerUserId === undefined ? current.ownerUserId : input.ownerUserId,
    counterpartyPartyId: input.counterpartyPartyId === undefined ? current.counterpartyPartyId : input.counterpartyPartyId,
    counterpartyRole: input.counterpartyRole === undefined ? current.counterpartyRole : input.counterpartyRole,
    plannedStart: dates.start,
    plannedEnd: dates.end,
    priority: input.priority ?? current.priority,
  };
  return { item, changes: changesOf(current, item) };
}

function nextDates(current: WorkItem, input: UpdateWorkItemInput): { readonly start: WorkItem['plannedStart']; readonly end: WorkItem['plannedEnd'] } {
  const start = input.plannedStart ?? current.plannedStart;
  const end = input.plannedEnd ?? current.plannedEnd;
  if (compareDates(start, end) > 0) throw new ValidationFailedError('计划开始日不能晚于结束日');
  return { start, end };
}

function requiredTitle(value: string): string {
  if (value.trim() === '') throw new ValidationFailedError('排期项标题不能为空');
  return value.trim();
}

function changesOf(current: WorkItem, next: WorkItem): readonly Change[] {
  return [
    ...(current.ownerUserId === next.ownerUserId ? [] : [{ kind: 'owner_changed' as const, field: 'ownerUserId', oldValue: current.ownerUserId, newValue: next.ownerUserId }]),
    ...(current.plannedStart === next.plannedStart ? [] : [{ kind: 'date_changed' as const, field: 'plannedStart', oldValue: current.plannedStart, newValue: next.plannedStart }]),
    ...(current.plannedEnd === next.plannedEnd ? [] : [{ kind: 'date_changed' as const, field: 'plannedEnd', oldValue: current.plannedEnd, newValue: next.plannedEnd }]),
  ];
}

function stageOf(item: WorkItem) {
  if (item.subjectType !== 'order_line' || item.subjectId === null) return undefined;
  const line = item.subjectId;
  return PROCUREMENT_SCHEDULE_STAGES.find((stage) => item.id === procurementStageId(line, stage));
}

async function assertProcurementDates(tx: PlanStores, { item, stage }: { readonly item: WorkItem; readonly stage: ProcurementScheduleStage }): Promise<void> {
  if (item.subjectId === null) return;
  if (stage !== 'production' && item.plannedStart !== item.plannedEnd) throw new ValidationFailedError('里程碑只使用一个计划日期');
  const subject = item.subjectId;
  if (stage === 'order') {
    const { dates } = await tx.procurementDates({ orderLineId: orderLineId(String(subject)), store: 'all' });
    if (dates.releasedOn !== null && item.plannedStart < dates.releasedOn) throw new ValidationFailedError('计划下单日不能早于需求下发日');
  }
  const siblings = await tx.workItems.listBySubjects([{ subjectType: 'order_line', subjectId: subject }]);
  assertNeighborDates({ item, stage, siblings });
}

function assertNeighborDates({ item, stage, siblings }: { readonly item: WorkItem; readonly stage: ProcurementScheduleStage; readonly siblings: readonly WorkItem[] }): void {
  const index = PROCUREMENT_SCHEDULE_STAGES.indexOf(stage);
  const beforeStage = PROCUREMENT_SCHEDULE_STAGES[index - 1];
  const afterStage = PROCUREMENT_SCHEDULE_STAGES[index + 1];
  const before = siblingOf({ siblings, subject: item.subjectId, stage: beforeStage });
  const after = siblingOf({ siblings, subject: item.subjectId, stage: afterStage });
  if (before !== undefined && beforeStage !== undefined && !canFollow({ from: before, to: item, nextStage: stage })) {
    throw new ValidationFailedError(`请先核对前置节点「${PROCUREMENT_STAGE_LABELS[beforeStage]}」的日期`);
  }
  if (after !== undefined && afterStage !== undefined && !canFollow({ from: item, to: after, nextStage: afterStage })) {
    throw new ValidationFailedError(`请先核对后续节点「${PROCUREMENT_STAGE_LABELS[afterStage]}」的日期`);
  }
}

function siblingOf({ siblings, subject, stage }: { readonly siblings: readonly WorkItem[]; readonly subject: WorkItem['subjectId']; readonly stage: ProcurementScheduleStage | undefined }) {
  if (stage === undefined || subject === null) return undefined;
  return siblings.find((node) => node.id === procurementStageId(subject, stage));
}

function canFollow({ from, to, nextStage }: { readonly from: WorkItem; readonly to: WorkItem; readonly nextStage: ProcurementScheduleStage }) {
  return from.plannedEnd < to.plannedStart || from.plannedEnd === to.plannedStart && nextStage !== 'production';
}
