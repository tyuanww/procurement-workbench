import { and, desc, eq, or, sql } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import type { WorkItemEventRepository, WorkItemRepository, WorkItemDependencyRepository, WorkItemSubjectKey } from '../../../../application/src/ports/plan.js';
import {
  COUNTERPARTY_ROLES,
  DEPENDENCY_KINDS,
  WORK_ITEM_EVENT_KINDS,
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_SOURCES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_SUBJECT_TYPES,
  type WorkItem,
  type WorkItemDependency,
  type WorkItemEvent,
} from '../../../../domain/src/entities/work-items.js';
import { localDate } from '../../../../domain/src/values/local-date.js';
import type { AppDatabase } from '../../client.js';
import { entityId, entityIdOrNull } from '../../mappers/id.js';
import { instant } from '../../mappers/time.js';
import { oneOf } from '../../queries/follow-up/guards.js';
import { workItemDependencies, workItemEvents, workItems } from '../../schema/work-items.js';

type WorkItemRow = typeof workItems.$inferSelect;
type WorkItemEventRow = typeof workItemEvents.$inferSelect;
type WorkItemDependencyRow = typeof workItemDependencies.$inferSelect;

export function workItemRepository(db: AppDatabase): WorkItemRepository {
  return {
    async get(id) {
      const found = await findWorkItem(db, id);
      if (found === undefined) throw new NotFoundError('排期项', id);
      return found;
    },
    find: (id) => findWorkItem(db, id),
    async save(entity) {
      const row = workItemInsert(entity);
      await db.insert(workItems).values(row).onConflictDoUpdate({ target: workItems.id, set: row });
    },
    async saveConditional(entity, expectedVersion) {
      const row = workItemInsert(entity);
      const updated = await db.update(workItems).set(row).where(and(eq(workItems.id, entity.id), eq(workItems.version, expectedVersion))).returning();
      return updated.length > 0;
    },
    listBySubjects: (subjects) => listBySubjects(db, subjects),
  };
}

export function workItemEventRepository(db: AppDatabase): WorkItemEventRepository {
  return {
    async append(event) {
      await db.insert(workItemEvents).values(eventInsert(event));
    },
    async listByWorkItem(workItemId, limit) {
      const rows = await db.select().from(workItemEvents).where(eq(workItemEvents.workItemId, workItemId)).orderBy(desc(workItemEvents.createdAt)).limit(limit);
      return rows.map(toEvent);
    },
  };
}

export function workItemDependencyRepository(db: AppDatabase): WorkItemDependencyRepository {
  return {
    async save(dependency) {
      const row = dependencyInsert(dependency);
      await db.insert(workItemDependencies).values(row).onConflictDoNothing({ target: [workItemDependencies.fromItemId, workItemDependencies.toItemId, workItemDependencies.kind] });
    },
    async remove(id) {
      await db.delete(workItemDependencies).where(eq(workItemDependencies.id, id));
    },
    async lockGraph() {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext('supply.work_item_dependencies'))`);
    },
    async findPair(input) {
      const rows = await db.select().from(workItemDependencies).where(and(
        eq(workItemDependencies.fromItemId, input.fromItemId),
        eq(workItemDependencies.toItemId, input.toItemId),
        eq(workItemDependencies.kind, input.kind),
      ));
      const row = rows[0];
      return row === undefined ? undefined : toDependency(row);
    },
    async listAll() {
      return (await db.select().from(workItemDependencies)).map(toDependency);
    },
    async listByItem(workItemId) {
      const rows = await db.select().from(workItemDependencies).where(or(eq(workItemDependencies.fromItemId, workItemId), eq(workItemDependencies.toItemId, workItemId)));
      return rows.map(toDependency);
    },
  };
}

async function findWorkItem(db: AppDatabase, id: string): Promise<WorkItem | undefined> {
  const row = (await db.select().from(workItems).where(eq(workItems.id, id)))[0];
  return row === undefined ? undefined : toWorkItem(row);
}

async function listBySubjects(db: AppDatabase, subjects: readonly WorkItemSubjectKey[]): Promise<readonly WorkItem[]> {
  if (subjects.length === 0) return [];
  const rows = await db.select().from(workItems).where(or(...subjects.map((subject) => and(eq(workItems.subjectType, subject.subjectType), eq(workItems.subjectId, subject.subjectId)))));
  return rows.map(toWorkItem);
}

function toWorkItem(row: WorkItemRow): WorkItem {
  return {
    id: entityId(row.id),
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    subjectType: oneOf(WORK_ITEM_SUBJECT_TYPES, row.subjectType),
    subjectId: entityIdOrNull(row.subjectId),
    kind: oneOf(WORK_ITEM_KINDS, row.kind),
    title: row.title,
    ownerUserId: entityIdOrNull(row.ownerUserId),
    counterpartyPartyId: entityIdOrNull(row.counterpartyPartyId),
    counterpartyRole: row.counterpartyRole === null ? null : oneOf(COUNTERPARTY_ROLES, row.counterpartyRole),
    plannedStart: localDate(row.plannedStart),
    plannedEnd: localDate(row.plannedEnd),
    status: oneOf(WORK_ITEM_STATUSES, row.status),
    priority: oneOf(WORK_ITEM_PRIORITIES, row.priority),
    source: oneOf(WORK_ITEM_SOURCES, row.source),
    parentId: entityIdOrNull(row.parentId),
    version: row.version,
  };
}

function workItemInsert(entity: WorkItem): typeof workItems.$inferInsert {
  return {
    id: entity.id,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    subjectType: entity.subjectType,
    subjectId: entity.subjectId,
    kind: entity.kind,
    title: entity.title,
    ownerUserId: entity.ownerUserId,
    counterpartyPartyId: entity.counterpartyPartyId,
    counterpartyRole: entity.counterpartyRole,
    plannedStart: entity.plannedStart,
    plannedEnd: entity.plannedEnd,
    status: entity.status,
    priority: entity.priority,
    source: entity.source,
    parentId: entity.parentId,
    version: entity.version,
  };
}

export function toEvent(row: WorkItemEventRow): WorkItemEvent {
  return {
    id: entityId(row.id),
    workItemId: entityId(row.workItemId),
    kind: oneOf(WORK_ITEM_EVENT_KINDS, row.kind),
    field: row.field,
    oldValue: row.oldValue,
    newValue: row.newValue,
    actorUserId: entityId(row.actorUserId),
    note: row.note,
    createdAt: instant(row.createdAt),
  };
}

function eventInsert(event: WorkItemEvent): typeof workItemEvents.$inferInsert {
  return {
    id: event.id,
    workItemId: event.workItemId,
    kind: event.kind,
    field: event.field,
    oldValue: jsonbValue(event.oldValue),
    newValue: jsonbValue(event.newValue),
    actorUserId: event.actorUserId,
    note: event.note,
    createdAt: event.createdAt,
  };
}

function jsonbValue(value: unknown): unknown {
  if (value === null) return sql`'null'::jsonb`;
  return value;
}

function toDependency(row: WorkItemDependencyRow): WorkItemDependency {
  return {
    id: entityId(row.id),
    fromItemId: entityId(row.fromItemId),
    toItemId: entityId(row.toItemId),
    kind: oneOf(DEPENDENCY_KINDS, row.kind),
    createdAt: instant(row.createdAt),
  };
}

function dependencyInsert(dependency: WorkItemDependency): typeof workItemDependencies.$inferInsert {
  return {
    id: dependency.id,
    fromItemId: dependency.fromItemId,
    toItemId: dependency.toItemId,
    kind: dependency.kind,
    createdAt: dependency.createdAt,
  };
}
