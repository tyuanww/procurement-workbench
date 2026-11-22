import type { DeliveryBatch } from '../../../../domain/src/entities/orders.js';
import type { WorkItem } from '../../../../domain/src/entities/work-items.js';
import type { EntityId } from '../../../../domain/src/values/ids.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import type { GenerateWorkItems, GenerateWorkItemsDeps } from '../boundary.js';
import type { PlanStores } from '../ports.js';
import type { GenerateWorkItemsInput } from '../views.js';
import { newWorkItemEvent, workItemSnapshot } from '../policies/events.js';
import { auditOf } from '../../shared/audit.js';
import { milestoneDrafts, milestoneWorkItemId, type MilestoneDraft } from '../policies/milestones.js';

type GenerationState = { created: number; skipped: number };
type ExistingIndex = { readonly ids: ReadonlySet<string>; readonly manualSubjectIds: ReadonlySet<string> };
type BatchContext = {
  readonly tx: PlanStores;
  readonly index: ExistingIndex;
  readonly state: GenerationState;
  readonly ids: GenerateWorkItemsDeps['ids'];
  readonly actorId: EntityId;
  readonly at: string;
};

export const makeGenerateWorkItems =
  (deps: GenerateWorkItemsDeps): GenerateWorkItems =>
  async (input, actor) => {
    authorize(actor, 'records.write');
    assertGenerateInput(input);
    const at = deps.clock.now();
    return deps.uow.run(async (tx) => {
      const batches = await batchesOf(tx, input);
      if (batches.length === 0) return { created: 0, skipped: 0 };
      const existing = await tx.workItems.listBySubjects(batches.map((batch) => ({ subjectType: 'delivery_batch' as const, subjectId: batch.id })));
      const state: GenerationState = { created: 0, skipped: 0 };
      const context: BatchContext = { tx, index: indexOf(existing), state, ids: deps.ids, actorId: actor.id, at };
      for (const batch of batches) await generateForBatch({ ...context, batch });
      return { created: state.created, skipped: state.skipped };
    });
  };

function assertGenerateInput(input: GenerateWorkItemsInput): void {
  if ((input.batchIds ?? []).length === 0 && (input.orderLineIds ?? []).length === 0) {
    throw new ValidationFailedError('生成里程碑要指定批次或订单行');
  }
}

async function batchesOf(tx: PlanStores, input: GenerateWorkItemsInput): Promise<readonly DeliveryBatch[]> {
  const byBatch = await Promise.all((input.batchIds ?? []).map((id) => tx.batches.get(id)));
  const byLine = await Promise.all((input.orderLineIds ?? []).map((id) => tx.batches.listByOrderLine(id)));
  const merged = new Map<string, DeliveryBatch>();
  for (const batch of [...byBatch, ...byLine.flat()]) merged.set(batch.id, batch);
  return [...merged.values()];
}

function indexOf(existing: readonly WorkItem[]): ExistingIndex {
  const manualSubjectIds = existing.flatMap((item) => (item.source === 'batch_milestone' || item.subjectId === null ? [] : [item.subjectId]));
  return { ids: new Set(existing.map((item) => item.id)), manualSubjectIds: new Set(manualSubjectIds) };
}

async function generateForBatch(input: BatchContext & { readonly batch: DeliveryBatch }): Promise<void> {
  const drafts = milestoneDrafts(input.batch);
  if (input.index.manualSubjectIds.has(input.batch.id)) {
    input.state.skipped += drafts.length;
    return;
  }
  const line = await input.tx.orderLines.find(input.batch.orderLineId);
  for (const draft of drafts) await generateOne({ ...input, draft, ownerUserId: line?.buyerUserId ?? null });
}

async function generateOne(input: BatchContext & { readonly batch: DeliveryBatch; readonly draft: MilestoneDraft; readonly ownerUserId: EntityId | null }): Promise<void> {
  const id = milestoneWorkItemId(input.batch.id, input.draft.field);
  if (input.index.ids.has(id)) {
    input.state.skipped += 1;
    return;
  }
  const entity = milestoneOf({ batch: input.batch, draft: input.draft, id, ownerUserId: input.ownerUserId, at: input.at });
  await input.tx.workItems.save(entity);
  await input.tx.workItemEvents.append(newWorkItemEvent({
    id: input.ids.next(),
    workItemId: id,
    kind: 'created',
    field: null,
    oldValue: null,
    newValue: workItemSnapshot(entity),
    actorUserId: input.actorId,
    note: null,
    createdAt: input.at,
  }));
  await input.tx.audit.record(auditOf({ action: 'work_item.generate', subject: entity, ctx: { actor: { id: input.actorId }, at: input.at, entity: '排期任务' } }));
  input.state.created += 1;
}

function milestoneOf(input: { readonly batch: DeliveryBatch; readonly draft: MilestoneDraft; readonly id: EntityId; readonly ownerUserId: EntityId | null; readonly at: string }): WorkItem {
  return {
    id: input.id,
    createdAt: input.at,
    updatedAt: input.at,
    subjectType: 'delivery_batch',
    subjectId: input.batch.id,
    kind: 'milestone',
    title: input.draft.title,
    ownerUserId: input.ownerUserId,
    counterpartyPartyId: null,
    counterpartyRole: null,
    plannedStart: input.draft.date,
    plannedEnd: input.draft.date,
    status: 'planned',
    priority: 'normal',
    source: 'batch_milestone',
    parentId: null,
    version: 0,
  };
}
