import { asc, eq, inArray, type SQL } from 'drizzle-orm';
import type { IncomingWorkItemDependency, WorkItemDependencyView, WorkItemPredecessor } from '../../../../application/src/ports/plan-views.js';
import { localDate } from '@sw/domain';
import { DEPENDENCY_KINDS, WORK_ITEM_STATUSES } from '../../../../domain/src/entities/work-items.js';
import type { AppDatabase } from '../../client.js';
import { instant } from '../../mappers/time.js';
import { workItemDependencies, workItems } from '../../schema/work-items.js';
import { oneOf } from '../follow-up/guards.js';

type DependencyRow = { readonly edge: WorkItemDependencyView; readonly predecessor: WorkItemPredecessor | null };

export async function incomingDependencies(db: AppDatabase, workItemIds: readonly string[]): Promise<readonly IncomingWorkItemDependency[]> {
  if (workItemIds.length === 0) return [];
  const rows = await readDependencies(db, inArray(workItemDependencies.toItemId, [...workItemIds]));
  return rows.map(toIncomingDependency);
}

export async function readDependencies(db: AppDatabase, where: SQL | undefined): Promise<readonly DependencyRow[]> {
  const rows = await db.select({
    edge: workItemDependencies,
    predecessor: {
      id: workItems.id, title: workItems.title, plannedEnd: workItems.plannedEnd, status: workItems.status,
    },
  }).from(workItemDependencies)
    .leftJoin(workItems, eq(workItemDependencies.fromItemId, workItems.id))
    .where(where)
    .orderBy(asc(workItems.plannedEnd), asc(workItemDependencies.fromItemId), asc(workItemDependencies.toItemId));
  return rows.map(({ edge, predecessor }) => ({
    edge: { ...edge, kind: oneOf(DEPENDENCY_KINDS, edge.kind), createdAt: instant(edge.createdAt) },
    predecessor: predecessor === null ? null : { ...predecessor, plannedEnd: localDate(predecessor.plannedEnd), status: oneOf(WORK_ITEM_STATUSES, predecessor.status) },
  }));
}

export function toIncomingDependency(row: DependencyRow): IncomingWorkItemDependency {
  return { ...row.edge, predecessor: row.predecessor };
}
