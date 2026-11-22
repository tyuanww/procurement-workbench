import { eq } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import { EXCEPTION_STATUSES, EXCEPTION_TYPES, FOLLOW_UP_KINDS, type ExceptionRecord, type FollowUp } from '@sw/domain';
import type { ExceptionRepository } from '../../../application/src/ports/exception-repository.js';
import type { FollowUpRepository } from '../../../application/src/ports/follow-up-repository.js';
import type { AppDatabase } from '../client.js';
import { instant, instantOrNull } from '../mappers/time.js';
import { exceptions, followUps } from '../schema/orders.js';
import { deliveryBatchIdOrNull, entityId, entityIdOrNull, orderLineId } from '../mappers/id.js';

export function exceptionRepository(db: AppDatabase): ExceptionRepository {
  return {
    get: (id) => getException(db, id),
    find: (id) => findException(db, id),
    save: (entity) => saveException(db, entity),
    remove: (id) => removeException(db, id),
  };
}

export function followUpRepository(db: AppDatabase): FollowUpRepository {
  return {
    get: (id) => getFollowUp(db, id),
    find: (id) => findFollowUp(db, id),
    save: (entity) => saveFollowUp(db, entity),
    remove: (id) => removeFollowUp(db, id),
  };
}

async function getException(db: AppDatabase, id: string): Promise<ExceptionRecord> {
  const found = await findException(db, id);
  if (found === undefined) throw new NotFoundError('异常', id);
  return found;
}

async function findException(db: AppDatabase, id: string): Promise<ExceptionRecord | undefined> {
  const row = (await db.select().from(exceptions).where(eq(exceptions.id, id)))[0];
  return row === undefined ? undefined : toException(row);
}

async function saveException(db: AppDatabase, entity: ExceptionRecord): Promise<void> {
  await db.insert(exceptions).values(entity).onConflictDoUpdate({ target: exceptions.id, set: entity });
}

async function getFollowUp(db: AppDatabase, id: string): Promise<FollowUp> {
  const found = await findFollowUp(db, id);
  if (found === undefined) throw new NotFoundError('跟进', id);
  return found;
}

async function findFollowUp(db: AppDatabase, id: string): Promise<FollowUp | undefined> {
  const row = (await db.select().from(followUps).where(eq(followUps.id, id)))[0];
  return row === undefined ? undefined : toFollowUp(row);
}

async function saveFollowUp(db: AppDatabase, entity: FollowUp): Promise<void> {
  const { nextFollowUpAt, ...fields } = entity;
  const row = { ...fields, reminder: nextFollowUpAt === undefined ? null : { nextAt: nextFollowUpAt } };
  await db.insert(followUps).values(row).onConflictDoUpdate({ target: followUps.id, set: row });
}

async function removeException(db: AppDatabase, id: string): Promise<void> {
  const deleted = await db.delete(exceptions).where(eq(exceptions.id, id)).returning();
  if (deleted.length === 0) throw new NotFoundError('异常', id);
}

async function removeFollowUp(db: AppDatabase, id: string): Promise<void> {
  const deleted = await db.delete(followUps).where(eq(followUps.id, id)).returning();
  if (deleted.length === 0) throw new NotFoundError('跟进', id);
}

function toException(row: typeof exceptions.$inferSelect): ExceptionRecord {
  return {
    ...row,
    id: entityId(row.id),
    orderLineId: orderLineId(row.orderLineId),
    batchId: deliveryBatchIdOrNull(row.batchId),
    openedBy: entityId(row.openedBy),
    closedBy: entityIdOrNull(row.closedBy),
    type: oneOf(EXCEPTION_TYPES, row.type),
    status: oneOf(EXCEPTION_STATUSES, row.status),
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    closedAt: instantOrNull(row.closedAt),
  };
}

function toFollowUp(row: typeof followUps.$inferSelect): FollowUp {
  const { reminder, ...fields } = row;
  return {
    ...fields, id: entityId(row.id), orderLineId: orderLineId(row.orderLineId), batchId: deliveryBatchIdOrNull(row.batchId),
    partyId: entityIdOrNull(row.partyId), createdBy: entityId(row.createdBy), kind: oneOf(FOLLOW_UP_KINDS, row.kind),
    createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt),
    ...(reminder === null ? {} : { nextFollowUpAt: reminder.nextAt }),
  };
}

function oneOf<T extends string>(values: readonly T[], value: string): T {
  for (const item of values) if (item === value) return item;
  throw new Error(`未知枚举 ${value}`);
}
