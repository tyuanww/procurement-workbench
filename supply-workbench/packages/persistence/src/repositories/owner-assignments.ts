import { and, asc, eq, isNull } from 'drizzle-orm';
import type { OwnerAssignment, OwnerAssignmentSource, OwnerAssignmentStatus } from '@sw/domain';
import type { OwnerAssignmentRepository, OwnerRef } from '../../../application/src/ports/owner-assignment-repository.js';
import type { AppDatabase } from '../client.js';
import { entityId, entityIdOrNull, orderLineId } from '../mappers/id.js';
import { instant, instantOrNull } from '../mappers/time.js';
import { ownerAssignments } from '../schema/orders.js';
import { users } from '../schema/platform.js';

const STATUSES: readonly OwnerAssignmentStatus[] = ['assigned', 'pending'];
const SOURCES: readonly OwnerAssignmentSource[] = ['po_master', 'mapping_import', 'manual'];

export function ownerAssignmentRepository(db: AppDatabase): OwnerAssignmentRepository {
  return {
    findCurrent: (subjectId) => findCurrent(db, subjectId),
    listPending: async () => (await db.select().from(ownerAssignments).where(and(eq(ownerAssignments.status, 'pending'), isNull(ownerAssignments.supersededAt))).orderBy(asc(ownerAssignments.createdAt))).map(toAssignment),
    findUsersByName: (name) => findUsersByName(db, name),
    save: (entity) => save(db, entity),
  };
}

async function findCurrent(db: AppDatabase, subjectId: string): Promise<OwnerAssignment | undefined> {
  const rows = await db.select().from(ownerAssignments)
    .where(and(eq(ownerAssignments.subjectType, 'order_line'), eq(ownerAssignments.subjectId, subjectId), isNull(ownerAssignments.supersededAt)));
  const row = rows[0];
  return row === undefined ? undefined : toAssignment(row);
}

async function findUsersByName(db: AppDatabase, name: string): Promise<readonly OwnerRef[]> {
  const trimmed = name.trim();
  if (trimmed === '') return [];
  const rows = await db.select().from(users).where(and(eq(users.active, true), eq(users.name, trimmed)));
  return rows.map((row) => ({ id: entityId(row.id), name: row.name }));
}

async function save(db: AppDatabase, entity: OwnerAssignment): Promise<void> {
  const row = toRow(entity);
  await db.insert(ownerAssignments).values(row).onConflictDoUpdate({ target: ownerAssignments.id, set: row });
}

function toAssignment(row: typeof ownerAssignments.$inferSelect): OwnerAssignment {
  return {
    id: entityId(row.id),
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    subjectType: 'order_line',
    subjectId: orderLineId(row.subjectId),
    ownerUserId: entityIdOrNull(row.ownerUserId),
    ownerNameRaw: row.ownerNameRaw,
    status: oneOf(STATUSES, row.status),
    source: oneOf(SOURCES, row.source),
    sourceRef: entityIdOrNull(row.sourceRef),
    effectiveAt: instant(row.effectiveAt),
    supersededAt: instantOrNull(row.supersededAt),
  };
}

function toRow(entity: OwnerAssignment): typeof ownerAssignments.$inferInsert {
  return {
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    subjectType: entity.subjectType,
    subjectId: entity.subjectId,
    ownerUserId: entity.ownerUserId,
    ownerNameRaw: entity.ownerNameRaw,
    status: entity.status,
    source: entity.source,
    sourceRef: entity.sourceRef,
    effectiveAt: entity.effectiveAt,
    supersededAt: entity.supersededAt,
  };
}

function oneOf<T extends string>(values: readonly T[], value: string): T {
  for (const item of values) if (item === value) return item;
  throw new Error(`未知枚举 ${value}`);
}
