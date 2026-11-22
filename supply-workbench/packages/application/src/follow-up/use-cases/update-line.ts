import { updateLine, type EntityId, type OrderLine, type OwnerAssignment } from '@sw/domain';
import type { UpdateLine, UpdateLineDeps } from '../boundary.js';
import type { OrderLineDetail } from '../views.js';
import type { Actor } from '../../shared/actor.js';
import type { UnitOfWorkStores } from '../../ports/unit-of-work.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { StateConflictError, ValidationFailedError } from '../../shared/errors.js';
import { assertCanAssignOwner, isOwnerAccount, recordManualOwner, requireOwnerAccount } from '../../shared/owner-assignment.js';
import { refreshLineProjection } from '../../shared/line-projection.js';

type OwnerUndo = NonNullable<OrderLineDetail['ownerUndo']>;

export const makeUpdateLine =
  (deps: UpdateLineDeps): UpdateLine =>
  async (input, actor) => {
    authorize(actor, 'lines.write');
    const { lineId, expectedOwnerAssignmentId, ...patch } = input;
    if (expectedOwnerAssignmentId !== undefined && patch.buyerUserId === undefined) {
      throw new ValidationFailedError('撤销负责人修改时需要指定原负责人');
    }
    return deps.uow.run(async (tx) => {
      const isOwnerEdit = patch.buyerUserId !== undefined;
      const before = await (isOwnerEdit ? tx.orderLines.lock(lineId) : tx.orderLines.get(lineId));
      const previousOwner = isOwnerEdit ? await currentOwnerForWrite(tx, { before, actor, expectedOwnerAssignmentId }) : undefined;
      const owner = patch.buyerUserId == null ? patch.buyerUserId : await requireOwnerAccount(tx.users, patch.buyerUserId);
      const at = deps.clock.now();
      const after = updateLine({ line: before, patch, at });
      await saveLine(tx, { line: after, previousUpdatedAt: before.updatedAt });
      if (owner !== undefined) await recordManualOwner({ tx, at, line: after, owner, nextId: () => deps.ids.next() });
      await refreshLineProjection(tx, [lineId]);
      await tx.audit.record(auditOf({ action: 'line.update', subject: after, ctx: { actor, at, before, after, entity: '订单行' } }));
      const ownerUndo = expectedOwnerAssignmentId !== undefined || owner == null ? undefined
        : await ownerUndoOf({ tx, before, previousOwner, nextBuyerId: owner.id });
      return ownerUndo === undefined ? { lineId } : { lineId, ownerUndo };
    });
  };

async function currentOwnerForWrite(tx: UnitOfWorkStores, input: {
  readonly before: OrderLine;
  readonly actor: Actor;
  readonly expectedOwnerAssignmentId: EntityId | undefined;
}) {
  assertCanAssignOwner(input.actor, input.before);
  const current = await tx.ownerAssignments?.findCurrent(input.before.id);
  if (input.expectedOwnerAssignmentId !== undefined && current?.id !== input.expectedOwnerAssignmentId) {
    throw new StateConflictError('owner_assignment.changed');
  }
  return current;
}

async function saveLine(tx: UnitOfWorkStores, { line, previousUpdatedAt }: { readonly line: OrderLine; readonly previousUpdatedAt: string }): Promise<void> {
  if (tx.orderLines.saveConditional === undefined) {
    await tx.orderLines.save(line);
  } else if (!await tx.orderLines.saveConditional(line, previousUpdatedAt)) {
    throw new StateConflictError('order_line.updated_at');
  }
}

async function ownerUndoOf(input: {
  readonly tx: UnitOfWorkStores;
  readonly before: OrderLine;
  readonly previousOwner: OwnerAssignment | undefined;
  readonly nextBuyerId: EntityId;
}): Promise<OwnerUndo | undefined> {
  const { tx, before, previousOwner, nextBuyerId } = input;
  if (before.buyerUserId === nextBuyerId) return undefined;
  const previousBuyer = await restorableBuyer(tx, { buyerId: before.buyerUserId, assignment: previousOwner });
  if (previousBuyer === undefined) return undefined;
  const saved = await tx.ownerAssignments?.findCurrent(before.id);
  return saved === undefined ? undefined : { expectedAssignmentId: saved.id, previousBuyer };
}

// 普通改派只会写手工归属。保留导入和待审核来源需要恢复完整历史，不能用改派模拟。
async function restorableBuyer(tx: UnitOfWorkStores, { buyerId, assignment }: { readonly buyerId: EntityId | null; readonly assignment: OwnerAssignment | undefined }): Promise<OwnerUndo['previousBuyer'] | undefined> {
  if (buyerId === null && assignment === undefined) return null;
  if (buyerId === null || assignment?.source !== 'manual' || assignment.ownerUserId !== buyerId) return undefined;
  const previousBuyer = await tx.users.find(buyerId);
  return previousBuyer === undefined || !isOwnerAccount(previousBuyer) ? undefined : { id: previousBuyer.id, name: previousBuyer.name };
}
