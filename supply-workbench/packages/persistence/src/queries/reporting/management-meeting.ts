import type { ManagementDecision, ManagementMeetingPeriod, ManagementMeetingRepository } from '@sw/application';
import { localDate } from '@sw/domain';
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import type { AppDatabase } from '../../client.js';
import { instant } from '../../mappers/time.js';
import { managementMeetingDecisions as decisions } from '../../schema/management-meeting.js';
import { users } from '../../schema/platform.js';
import { loadMeetingDevelopment, type LoadManagementMeetingDevelopment } from './meeting-development.js';
import { hasMeetingMaterial, meetingMaterials } from './meeting-materials.js';

export type { LoadManagementMeetingDevelopment } from './meeting-development.js';

export function managementMeetingRepository({ db, timeZone, loadDevelopment = loadMeetingDevelopment }: {
  readonly db: AppDatabase;
  readonly timeZone: string;
  readonly loadDevelopment?: LoadManagementMeetingDevelopment;
}): ManagementMeetingRepository {
  return {
    async load(period) {
      const materials = await meetingMaterials({ db, period, timeZone });
      const recordedDecisions = await decisionsFor({ db, period, timeZone });
      const development = await loadDevelopment(db, period);
      return { ...period, materials, decisions: recordedDecisions, development };
    },
    owners: () => db.select({ id: users.id, name: users.name }).from(users).where(eq(users.active, true)).orderBy(asc(users.name), asc(users.id)),
    hasMaterial: (input) => hasMeetingMaterial(db, input),
    async insert(decision) {
      await db.insert(decisions).values({
        id: decision.id, store: decision.store, weekStart: decision.weekStart, materialLineId: decision.materialLineId,
        decision: decision.decision, ownerId: decision.owner.id, ownerName: decision.owner.name,
        dueDate: decision.dueDate, completionCriteria: decision.completionCriteria, recordedAt: decision.recordedAt,
        decidedById: decision.decidedBy.id, decidedByName: decision.decidedBy.name,
      });
    },
    async lock(id) {
      const [row] = await db.select().from(decisions).where(eq(decisions.id, id)).for('update');
      return row === undefined ? undefined : fromRow(row);
    },
    async complete(id, completion) {
      await db.update(decisions).set({
        completionEvidence: completion.evidence, completedAt: completion.at,
        completedById: completion.by.id, completedByName: completion.by.name,
      }).where(eq(decisions.id, id));
    },
  };
}

async function decisionsFor({ db, period, timeZone }: {
  readonly db: AppDatabase;
  readonly period: ManagementMeetingPeriod;
  readonly timeZone: string;
}) {
  const rows = await db.select().from(decisions).where(and(
    eq(decisions.store, period.store),
    lte(decisions.weekStart, period.weekStart),
    sql`(${decisions.completedAt} is null or (${decisions.completedAt} AT TIME ZONE ${timeZone})::date >= ${period.previousWeekStart}::date)`,
  )).orderBy(desc(decisions.weekStart), asc(decisions.dueDate), asc(decisions.id));
  return rows.map(fromRow);
}

function fromRow(row: typeof decisions.$inferSelect): ManagementDecision {
  const { completedAt, completionEvidence, completedById, completedByName } = row;
  const completion = completedAt === null || completionEvidence === null || completedById === null || completedByName === null
    ? null : { evidence: completionEvidence, at: instant(completedAt), by: { id: completedById, name: completedByName } };
  return {
    id: row.id, store: row.store, weekStart: localDate(row.weekStart), materialLineId: row.materialLineId,
    decision: row.decision, owner: { id: row.ownerId, name: row.ownerName },
    dueDate: localDate(row.dueDate), completionCriteria: row.completionCriteria, recordedAt: instant(row.recordedAt),
    decidedBy: { id: row.decidedById, name: row.decidedByName },
    completion,
  };
}
