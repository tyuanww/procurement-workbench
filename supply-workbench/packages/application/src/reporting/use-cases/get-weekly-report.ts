import { addDays, type WeeklyReport as StoredReport } from '@sw/domain';
import type { GetWeeklyReport, GetWeeklyReportDeps, ListWeeklyReports, ListWeeklyReportsDeps } from '../boundary.js';
import type { WeeklyReport, WeeklyReportListItem } from '../views.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { unpackWeekly } from '../policies/stored-weekly.js';
import { authorize } from '../../shared/authorize.js';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const WEEK_END_OFFSET = 6;

export const makeListWeeklyReports =
  (deps: ListWeeklyReportsDeps): ListWeeklyReports =>
  async (input, actor) => {
    authorize(actor, 'reports.read');
    const page = input.page ?? DEFAULT_PAGE;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const listed = await deps.reports.list({ page, pageSize });
    return { items: listed.items.map(listItem), page: { page, pageSize, total: listed.total } };
  };

export const makeGetWeeklyReport =
  (deps: GetWeeklyReportDeps): GetWeeklyReport =>
  async (input, actor) => {
    authorize(actor, 'reports.read');
    const stored = await deps.reports.get(input.reportId);
    return toView(stored);
  };

function listItem(stored: StoredReport): WeeklyReportListItem {
  const packed = unpackWeekly(stored.data);
  return {
    id: stored.id,
    weekStart: stored.weekStart,
    weekEnd: addDays(stored.weekStart, WEEK_END_OFFSET),
    generatedAt: stored.generatedAt,
    generatedBy: { id: stored.generatedBy, name: packed?.generatedByName ?? stored.generatedBy },
    supersededBy: stored.supersededBy,
    exports: packed?.exports ?? [],
  };
}

function toView(stored: StoredReport): WeeklyReport {
  const packed = unpackWeekly(stored.data);
  if (packed === null) throw new ValidationFailedError('周报数据无法读取');
  return {
    id: stored.id,
    weekStart: stored.weekStart,
    weekEnd: addDays(stored.weekStart, WEEK_END_OFFSET),
    generatedAt: stored.generatedAt,
    generatedBy: { id: stored.generatedBy, name: packed.generatedByName },
    supersededBy: stored.supersededBy,
    dataWatermark: packed.report.notes.sources,
    data: packed.report,
  };
}
