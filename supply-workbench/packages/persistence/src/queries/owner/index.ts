import { and, eq, isNull } from 'drizzle-orm';
import type { OwnerAssignmentSource } from '@sw/domain';
import type { OwnerCoverageQueries, OwnerCoverageQuery } from '../../../../application/src/ports/owner-views.js';
import type { AppDatabase } from '../../client.js';
import { orderLines, ownerAssignments } from '../../schema/orders.js';

export function ownerQueries(db: AppDatabase): OwnerCoverageQueries {
  return {
    coverage: (query) => coverage(db, query),
    pending: () => pending(db),
  };
}

async function coverage(db: AppDatabase, query: OwnerCoverageQuery) {
  const lines = await db.select({ id: orderLines.id, buyerUserId: orderLines.buyerUserId }).from(orderLines);
  const scoped = query.buyerUserId === undefined ? lines : lines.filter((line) => line.buyerUserId === query.buyerUserId);
  const current = await db.select().from(ownerAssignments).where(and(eq(ownerAssignments.subjectType, 'order_line'), isNull(ownerAssignments.supersededAt)));
  const bySubject = new Map(current.map((assignment) => [assignment.subjectId, assignment]));
  let assigned = 0;
  let pending = 0;
  for (const line of scoped) {
    const assignment = bySubject.get(line.id);
    if (assignment === undefined) continue;
    if (assignment.status === 'assigned') assigned += 1;
    else pending += 1;
  }
  return { total: scoped.length, assigned, pending, unassigned: scoped.length - assigned - pending };
}

async function pending(db: AppDatabase) {
  const rows = await db.select().from(ownerAssignments)
    .where(and(eq(ownerAssignments.subjectType, 'order_line'), eq(ownerAssignments.status, 'pending'), isNull(ownerAssignments.supersededAt)));
  return rows.map((row) => ({
    id: row.id,
    lineId: row.subjectId,
    nameRaw: row.ownerNameRaw ?? '',
    source: sourceOf(row.source),
    effectiveAt: new Date(row.effectiveAt).toISOString(),
  }));
}

function sourceOf(value: string): OwnerAssignmentSource {
  if (value === 'po_master' || value === 'mapping_import' || value === 'manual') return value;
  throw new Error(`未知负责人来源 ${value}`);
}
