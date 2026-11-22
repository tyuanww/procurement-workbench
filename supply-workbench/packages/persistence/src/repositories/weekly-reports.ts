import { and, desc, eq, isNull } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import { localDate, type WeeklyReport } from '@sw/domain';
import type { WeeklyReportRepository } from '../../../application/src/ports/weekly-report-repository.js';
import type { AppDatabase } from '../client.js';
import { weeklyReports } from '../schema/archive.js';
import { entityId, entityIdOrNull } from '../mappers/id.js';
import { instant } from '../mappers/time.js';

export function weeklyReportRepository(db: AppDatabase): WeeklyReportRepository {
  return {
    async get(id) {
      const found = await findReport(db, id);
      if (found === undefined) throw new NotFoundError('周报', id);
      return found;
    },
    find: (id) => findReport(db, id),
    async findCurrent(weekStart) {
      const row = (await db.select().from(weeklyReports).where(and(eq(weeklyReports.weekStart, weekStart), isNull(weeklyReports.supersededBy))))[0];
      return row === undefined ? undefined : toReport(row);
    },
    async list(page) {
      const rows = await db.select().from(weeklyReports).orderBy(desc(weeklyReports.generatedAt));
      const start = (page.page - 1) * page.pageSize;
      return { items: rows.slice(start, start + page.pageSize).map(toReport), total: rows.length };
    },
    save: (entity) => saveReport(db, entity),
  };
}

async function saveReport(db: AppDatabase, entity: WeeklyReport): Promise<void> {
  const existing = await findReport(db, entity.id);
  if (existing !== undefined && reportBody(existing.data) !== reportBody(entity.data)) throw new Error('周报数据已冻结');
  await db.insert(weeklyReports).values(entity).onConflictDoUpdate({ target: weeklyReports.id, set: { ...entity, data: entity.data } });
}

function reportBody(data: unknown): string {
  if (typeof data !== 'object' || data === null || Array.isArray(data) || !('report' in data)) return JSON.stringify(data);
  const generatedByName = 'generatedByName' in data ? data.generatedByName : undefined;
  return JSON.stringify({ report: data.report, generatedByName });
}

async function findReport(db: AppDatabase, id: string): Promise<WeeklyReport | undefined> {
  const row = (await db.select().from(weeklyReports).where(eq(weeklyReports.id, id)))[0];
  return row === undefined ? undefined : toReport(row);
}

function toReport(row: typeof weeklyReports.$inferSelect): WeeklyReport {
  return { ...row, id: entityId(row.id), generatedBy: entityId(row.generatedBy), supersededBy: entityIdOrNull(row.supersededBy), weekStart: localDate(row.weekStart), createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt), generatedAt: instant(row.generatedAt) };
}
