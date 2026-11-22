import { compareDates, entityId, MAX_PROCUREMENT_PHASE_DAYS, PROCUREMENT_SCHEDULE_STAGES, PROCUREMENT_STAGE_LABELS, procurementDraft, procurementStageId, type EntityId, type LocalDate, type ProcurementCycle, type WorkItem } from '@sw/domain';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { StateConflictError, ValidationFailedError } from '../../shared/errors.js';
import type { Actor } from '../../shared/actor.js';
import type { PlanStores } from '../ports.js';
import type { PlanWriteDeps } from '../boundary.js';
import { newWorkItemEvent, workItemSnapshot } from '../policies/events.js';
import type { BuildProcurementSchedule, BuildProcurementScheduleInput, ProcurementScheduleDates } from '../../ports/procurement-schedule.js';

export const makeBuildProcurementSchedule =
  (deps: PlanWriteDeps): BuildProcurementSchedule =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    const cycle = checkedCycle(input.cycle);
    const workItemIds = PROCUREMENT_SCHEDULE_STAGES.map((stage) => procurementStageId(input.orderLineId, stage));
    const at = deps.clock.now();
    return deps.uow.run(async (tx) => {
      await tx.workItemDependencies.lockGraph();
      const { dates, buyerUserId } = await tx.procurementDates(input);
      const existing = await tx.workItems.listBySubjects([{ subjectType: 'order_line', subjectId: input.orderLineId }]);
      const prior = existing.filter((item) => workItemIds.includes(item.id));
      if (prior.length === workItemIds.length) return { workItemIds, created: false };
      if (prior.length > 0) throw new StateConflictError('采购排期节点不完整');
      assertScheduleWindow(dates);
      if (compareDates(input.orderOn, dates.releasedOn) < 0) throw new ValidationFailedError('计划下单日不能早于需求下发日');

      const owner = buyerUserId === null ? actor.id : entityId(buyerUserId);
      const context = { tx, ids: deps.ids, actor, at };
      await persistStages(context, { orderOn: input.orderOn, subjectId: input.orderLineId, owner, cycle, releasedOn: dates.releasedOn, originalTargetOn: dates.originalTargetOn });
      return { workItemIds, created: true };
    });
  };

function assertScheduleWindow(dates: ProcurementScheduleDates): asserts dates is ProcurementScheduleDates & { readonly releasedOn: LocalDate; readonly originalTargetOn: LocalDate } {
  if (dates.releasedOn === null || dates.originalTargetOn === null || dates.releaseDays === null) {
    throw new ValidationFailedError('需要有效的需求下发日与原目标交付日');
  }
}

type WriteContext = {
  readonly tx: PlanStores;
  readonly ids: PlanWriteDeps['ids'];
  readonly at: string;
  readonly actor: Actor;
};
type PlanInput = {
  readonly orderOn: LocalDate;
  readonly subjectId: EntityId;
  readonly owner: EntityId;
  readonly cycle: ProcurementCycle;
  readonly releasedOn: LocalDate;
  readonly originalTargetOn: LocalDate;
};

async function persistStages(context: WriteContext, plan: PlanInput): Promise<void> {
  const drafts = draftOf(plan);
  let previous: EntityId | null = null;
  for (const stage of PROCUREMENT_SCHEDULE_STAGES) {
    const draft = drafts[stage];
    const item: WorkItem = {
      id: procurementStageId(plan.subjectId, stage),
      createdAt: context.at, updatedAt: context.at, subjectType: 'order_line', subjectId: plan.subjectId,
      kind: stage === 'production' ? 'task' : 'milestone', title: PROCUREMENT_STAGE_LABELS[stage], ownerUserId: plan.owner,
      counterpartyPartyId: null, counterpartyRole: null, plannedStart: draft.start, plannedEnd: draft.end,
      status: 'planned', priority: 'normal', source: 'manual', parentId: null, version: 0,
    };
    await persistItem(context, { item, plan });
    if (previous !== null) await persistDependency(context, { fromItemId: previous, toItemId: item.id });
    previous = item.id;
  }
}

async function persistItem({ tx, ids, actor, at }: WriteContext, { item, plan }: { readonly item: WorkItem; readonly plan: PlanInput }): Promise<void> {
  await tx.workItems.save(item);
  await tx.workItemEvents.append(newWorkItemEvent({
    id: ids.next(), workItemId: item.id, kind: 'created', field: null, oldValue: null,
    newValue: { ...workItemSnapshot(item), procurementCycle: plan.cycle, releasedOn: plan.releasedOn, originalTargetOn: plan.originalTargetOn },
    actorUserId: actor.id, note: plan.cycle.basis, createdAt: at,
  }));
  await tx.audit.record(auditOf({ action: 'work_item.create', subject: item, ctx: { actor, at, entity: '排期任务' } }));
}

async function persistDependency({ tx, ids, actor, at }: WriteContext, pair: { readonly fromItemId: EntityId; readonly toItemId: EntityId }): Promise<void> {
  const dependency = { ...pair, id: ids.next(), kind: 'finish_to_start' as const, createdAt: at };
  await tx.workItemDependencies.save(dependency);
  await tx.workItemEvents.append(newWorkItemEvent({
    id: ids.next(), workItemId: pair.toItemId, kind: 'dependency_changed', field: 'dependency', oldValue: null,
    newValue: { ...pair, kind: dependency.kind }, actorUserId: actor.id, note: null, createdAt: at,
  }));
  await tx.audit.record(auditOf({ action: 'work_item.dependency_add', subject: dependency, ctx: { actor, at, entity: '排期依赖' } }));
}

function checkedCycle(cycle: BuildProcurementScheduleInput['cycle']) {
  const { materialsDays, productionDays, deliveryDays } = cycle;
  if (![materialsDays, productionDays, deliveryDays].every((days) => Number.isInteger(days) && days >= 0 && days <= MAX_PROCUREMENT_PHASE_DAYS)
      || productionDays < 1 || cycle.basis.trim() === '') {
    throw new ValidationFailedError('请填写可核实的齐料、生产、交付自然日及周期依据');
  }
  return { materialsDays, productionDays, deliveryDays, basis: cycle.basis.trim() };
}

function draftOf(input: Parameters<typeof procurementDraft>[0]) {
  try {
    return procurementDraft(input);
  } catch (cause) {
    throw new ValidationFailedError('计划日期超出支持范围', { orderOn: input.orderOn, cause: cause instanceof Error ? cause.message : '' });
  }
}
