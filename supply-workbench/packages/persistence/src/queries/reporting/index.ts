import type { WeeklyReportRepository } from '../../../../application/src/ports/weekly-report-repository.js';
import { weeklyReportRepository } from '../../repositories/weekly-reports.js';
import type { AppDatabase } from '../../client.js';

export function reportingQueries(db: AppDatabase): WeeklyReportRepository {
  return weeklyReportRepository(db);
}
