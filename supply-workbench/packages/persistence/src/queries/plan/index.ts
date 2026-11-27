import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import { attributeWorkItemEvents, eventInstant, eventUserIds, type AttributableWorkItemEvent } from '../../../../application/src/shared/work-item-event-attribution.js';
import { storeFilter } from '../store-progress/scope.js';
import type { PlanQueries } from '../../../../application/src/ports/plan.js';
import type { SchedulePlanQuery, WorkItemDetailView, WorkItemEventView, WorkItemListQuery, WorkItemListResult, WorkItemView } from '../../../../application/src/ports/plan-views.js';
import { WORK_ITEM_EVENT_KINDS } from '../../../../domain/src/entities/work-items.js';
import type { LocalDate } from '../../../../domain/src/values/local-date.js';
import type { AppDatabase } from '../../client.js';
import { oneOf } from '../follow-up/guards.js';
import { users } from '../../schema/platform.js';
import { orderLines } from '../../schema/orders.js';
import { workItemDependencies, workItemEvents, workItems } from '../../schema/work-items.js';
import { dailyWhere, listWhere, projectWhere, scheduleWhere, selectWorkItems } from './query.js';
import { toWorkItemView } from './view.js';
import { incomingDependencies, readDependencies, toIncomingDependency } from './dependency-views.js';
import { deliverySchedule } from './delivery-schedule.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;
const PAGE_MAX = 200;

export function planQueries(db: AppDatabase): PlanQueries {
  return {
    dailyItems: (query) => dailyItems(db, query.date),
    scheduleItems: (query) => scheduleItems(db, query),
    deliverySchedule: (query) => deliverySchedule(db, query),
    deliveryTasks: (batchIds) => deliveryTasks(db, batchIds),
    incomingDependencies: (workItemIds) => incomingDependencies(db, workItemIds),
    projectItems: (query) => projectItems(db, query),
    listItems: (query) => listItems(db, query),
    getItem: (query) => getItem(db, query),
  };
}

async function dailyItems(db: AppDatabase, date: LocalDate): Promise<readonly WorkItemView[]> {
  const rows = await selectWorkItems(db, { where: dailyWhere(date), orderBy: [asc(workItems.plannedEnd), asc(workItems.title)] });
  return rows.map(toWorkItemView);
}

async function scheduleItems(db: AppDatabase, query: Pick<SchedulePlanQuery, 'from' | 'to' | 'store' | 'includeClosed'>): Promise<readonly WorkItemView[]> {
  const rows = await selectWorkItems(db, { where: and(scheduleWhere(query), storeFilter({ store: query.store, line: orderLines.id, hasMaterialScope: true })), orderBy: [asc(workItems.plannedStart), asc(workItems.title)] });
  return rows.map(toWorkItemView);
}

async function deliveryTasks(db: AppDatabase, batchIds: readonly string[]): Promise<readonly WorkItemView[]> {
  if (batchIds.length === 0) return [];
  const rows = await selectWorkItems(db, {
    where: and(eq(workItems.subjectType, 'delivery_batch'), inArray(workItems.subjectId, batchIds)),
    orderBy: [asc(workItems.plannedStart), asc(workItems.title)],
  });
  return rows.map(toWorkItemView);
}

async function projectItems(db: AppDatabase, query: { readonly from: LocalDate; readonly to: LocalDate }): Promise<readonly WorkItemView[]> {
  const rows = await selectWorkItems(db, { where: projectWhere(query), orderBy: [asc(workItems.plannedStart), asc(workItems.title)] });
  return rows.map(toWorkItemView);
}

async function listItems(db: AppDatabase, query: WorkItemListQuery): Promise<WorkItemListResult> {
  const rows = await selectWorkItems(db, { where: listWhere(query), orderBy: [asc(workItems.plannedStart), asc(workItems.title)] });
  const items = rows.map(toWorkItemView);
  const page = query.page ?? DEFAULT_PAGE;
  const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, PAGE_MAX);
  return { items: items.slice((page - 1) * pageSize, page * pageSize), page: { page, pageSize, total: items.length } };
}

async function getItem(db: AppDatabase, query: { readonly workItemId: string; readonly eventLimit: number }): Promise<WorkItemDetailView> {
  const row = (await selectWorkItems(db, { where: eq(workItems.id, query.workItemId) }))[0];
  if (row === undefined) throw new NotFoundError('排期项', query.workItemId);
  const [events, dependencies] = await Promise.all([
    attributedEvents(db, query),
    readDependencies(db, or(eq(workItemDependencies.fromItemId, query.workItemId), eq(workItemDependencies.toItemId, query.workItemId))),
  ]);
  return {
    item: toWorkItemView(row),
    events,
    dependenciesOut: dependencies.filter((row) => row.edge.fromItemId === query.workItemId).map((row) => row.edge),
    dependenciesIn: dependencies.filter((row) => row.edge.toItemId === query.workItemId).map(toIncomingDependency),
  };
}

async function attributedEvents(db: AppDatabase, query: { readonly workItemId: string; readonly eventLimit: number }): Promise<readonly WorkItemEventView[]> {
  const rows = await db.select({
    id: workItemEvents.id,
    workItemId: workItemEvents.workItemId,
    kind: workItemEvents.kind,
    field: workItemEvents.field,
    oldValue: workItemEvents.oldValue,
    newValue: workItemEvents.newValue,
    oldAbsent: sql<boolean>`${workItemEvents.oldValue} is null`,
    newAbsent: sql<boolean>`${workItemEvents.newValue} is null`,
    actorUserId: workItemEvents.actorUserId,
    note: workItemEvents.note,
    createdAt: workItemEvents.createdAt,
  }).from(workItemEvents).where(eq(workItemEvents.workItemId, query.workItemId)).orderBy(asc(workItemEvents.createdAt), asc(workItemEvents.id)).limit(query.eventLimit + 1);
  const kept = rows.slice(0, query.eventLimit);
  const events = kept.map(toAttributableEvent);
  const openTimestamp = truncatedTimestamp(rows, query.eventLimit);
  return attributeWorkItemEvents({
    events,
    names: await userNames(db, eventUserIds(events)),
    ...(openTimestamp === undefined ? {} : { openTimestamp }),
  });
}

function truncatedTimestamp(rows: readonly { readonly createdAt: string }[], limit: number): string | undefined {
  const extra = rows[limit];
  const last = rows[limit - 1];
  if (extra === undefined || last === undefined) return undefined;
  const extraAt = eventInstant(extra.createdAt);
  const lastAt = eventInstant(last.createdAt);
  return extraAt === lastAt ? lastAt : undefined;
}

async function userNames(db: AppDatabase, ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row.name]));
}

function toAttributableEvent(row: {
  readonly id: string;
  readonly workItemId: string;
  readonly kind: string;
  readonly field: string | null;
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly oldAbsent: boolean;
  readonly newAbsent: boolean;
  readonly actorUserId: string;
  readonly note: string | null;
  readonly createdAt: string;
}): AttributableWorkItemEvent {
  return {
    id: row.id,
    workItemId: row.workItemId,
    kind: oneOf(WORK_ITEM_EVENT_KINDS, row.kind),
    field: row.field,
    oldValue: presentJson(row.oldAbsent, row.oldValue),
    newValue: presentJson(row.newAbsent, row.newValue),
    actorUserId: row.actorUserId,
    note: row.note,
    createdAt: eventInstant(row.createdAt),
  };
}

function presentJson(isAbsent: boolean, value: unknown): unknown {
  return isAbsent ? undefined : value;
}
