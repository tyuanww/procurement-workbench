import { can, normalizeText, type EntityId, type OrderLine, type OrderLineId, type OwnerAssignment, type OwnerAssignmentSource, type OwnerAssignmentStatus, type User } from '@sw/domain';
import type { OwnerAssignmentRepository } from '../ports/owner-assignment-repository.js';
import type { UnitOfWorkStores } from '../ports/unit-of-work.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { Actor } from './actor.js';
import { ForbiddenError, ValidationFailedError } from './errors.js';

/** 新仓储没接线时立刻失败，不静默跳过历史。 */
export function ownerAssignmentsOf(tx: UnitOfWorkStores): OwnerAssignmentRepository {
  const stores = tx.ownerAssignments;
  if (stores === undefined) throw new Error('负责人仓储没有接线：UnitOfWorkStores.ownerAssignments 为空');
  return stores;
}

/** buyer 只能改自己负责的行；无负责人的行可以认领。 */
export function assertCanAssignOwner(actor: Actor, line: OrderLine): void {
  if (line.buyerUserId === null || line.buyerUserId === actor.id || actor.roles.includes('admin')) return;
  throw new ForbiddenError('lines.write');
}

export function isOwnerAccount(user: User): boolean {
  return user.active && can(user, 'lines.write');
}

export async function requireOwnerAccount(users: UserRepository, id: string): Promise<User> {
  const user = await users.find(id);
  if (user === undefined || !isOwnerAccount(user)) throw new ValidationFailedError('请选择启用的采购账号', { field: 'buyerUserId' });
  return user;
}

export async function recordManualOwner(input: {
  readonly tx: UnitOfWorkStores;
  readonly at: string;
  readonly line: OrderLine;
  readonly owner: User | null;
  readonly nextId: () => EntityId;
}): Promise<OrderLine> {
  if (input.tx.ownerAssignments === undefined) return input.line;
  if (input.owner === null) return revokeOwnerAssignment(input);
  return applyOwnerAssignment({ ...input, desired: { status: 'assigned', ownerUserId: input.owner.id, ownerNameRaw: input.owner.name, source: 'manual', sourceRef: null } });
}

export type DesiredOwner = {
  readonly status: OwnerAssignmentStatus;
  readonly ownerUserId: EntityId | null;
  readonly ownerNameRaw: string | null;
  readonly source: OwnerAssignmentSource;
  readonly sourceRef: EntityId | null;
};

/**
 * 写当前负责人。旧记录只改 supersededAt，不删除。
 * 手工记录优先于导入；pending 永远不会把已有 assigned 降级。
 * 返回可能需要保存的订单行（buyerUserId 同步）。
 */
export async function applyOwnerAssignment(input: {
  readonly tx: UnitOfWorkStores;
  readonly nextId: () => EntityId;
  readonly at: string;
  readonly line: OrderLine;
  readonly desired: DesiredOwner;
}): Promise<OrderLine> {
  validate(input.desired);
  const owners = ownerAssignmentsOf(input.tx);
  const current = await owners.findCurrent(input.line.id);
  if (keepsCurrent(current, input.desired)) return input.line;
  if (current !== undefined) await owners.save({ ...current, updatedAt: input.at, supersededAt: input.at });
  await owners.save(assignmentOf({ id: input.nextId(), at: input.at, lineId: input.line.id, desired: input.desired }));
  return syncBuyer({ tx: input.tx, at: input.at, line: input.line, desired: input.desired });
}

/** 取消负责人：只退休当前记录，不写新记录。 */
export async function revokeOwnerAssignment(input: {
  readonly tx: UnitOfWorkStores;
  readonly at: string;
  readonly line: OrderLine;
}): Promise<OrderLine> {
  const owners = ownerAssignmentsOf(input.tx);
  const current = await owners.findCurrent(input.line.id);
  if (current !== undefined) await owners.save({ ...current, updatedAt: input.at, supersededAt: input.at });
  if (input.line.buyerUserId === null) return input.line;
  const next = { ...input.line, buyerUserId: null, updatedAt: input.at };
  await input.tx.orderLines.save(next);
  return next;
}

function keepsCurrent(current: OwnerAssignment | undefined, desired: DesiredOwner): boolean {
  if (current === undefined) return false;
  if (current.source === 'manual' && desired.source !== 'manual') return true;
  if (desired.status === 'pending' && current.status === 'assigned') return true;
  if (current.status !== desired.status) return false;
  if (current.status === 'assigned') return sameAssigned(current, desired);
  return samePendingName(current, desired);
}

function sameAssigned(current: OwnerAssignment, desired: DesiredOwner): boolean {
  return current.ownerUserId === desired.ownerUserId && current.source === desired.source;
}

function samePendingName(current: OwnerAssignment, desired: DesiredOwner): boolean {
  return normalizeText(current.ownerNameRaw ?? '') === normalizeText(desired.ownerNameRaw ?? '');
}

function validate(desired: DesiredOwner): void {
  if (desired.status === 'assigned' && desired.ownerUserId === null) throw new ValidationFailedError('归属记录缺负责人');
  if (desired.status === 'pending' && desired.ownerUserId !== null) throw new ValidationFailedError('待审核记录不能有负责人');
}

function assignmentOf(input: { readonly id: EntityId; readonly at: string; readonly lineId: OrderLineId; readonly desired: DesiredOwner }): OwnerAssignment {
  return {
    id: input.id,
    createdAt: input.at,
    updatedAt: input.at,
    subjectType: 'order_line',
    subjectId: input.lineId,
    ownerUserId: input.desired.ownerUserId,
    ownerNameRaw: input.desired.ownerNameRaw,
    status: input.desired.status,
    source: input.desired.source,
    sourceRef: input.desired.sourceRef,
    effectiveAt: input.at,
    supersededAt: null,
  };
}

async function syncBuyer(input: { readonly tx: UnitOfWorkStores; readonly at: string; readonly line: OrderLine; readonly desired: DesiredOwner }): Promise<OrderLine> {
  if (input.desired.status !== 'assigned') return input.line;
  if (input.line.buyerUserId === input.desired.ownerUserId) return input.line;
  const next = { ...input.line, buyerUserId: input.desired.ownerUserId, updatedAt: input.at };
  await input.tx.orderLines.save(next);
  return next;
}
