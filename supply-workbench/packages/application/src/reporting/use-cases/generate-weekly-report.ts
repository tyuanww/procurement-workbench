import { weekStart, type EntityId, type LocalDate, type WeeklyReport as StoredReport } from '@sw/domain';
import type { GenerateWeeklyReport, GenerateWeeklyReportDeps } from '../boundary.js';
import { MANAGEMENT_MEETING_STORES, meetingPeriod, type ManagementMeetingRepository, type ManagementMeetingSnapshot } from '../management-meeting.js';
import type { WeeklyReportData } from '../views.js';
import type { Actor } from '../../shared/actor.js';
import { auditOf } from '../../shared/audit.js';
import { authorize } from '../../shared/authorize.js';
import { ValidationFailedError } from '../../shared/errors.js';
import { assembleWeeklyReport, previousWeek, weekEnd } from '../policies/assemble-weekly-report.js';
import { packWeekly, unpackWeekly } from '../policies/stored-weekly.js';

export const makeGenerateWeeklyReport =
  (deps: GenerateWeeklyReportDeps): GenerateWeeklyReport =>
  async (input, actor) => {
    authorize(actor, 'reports.generate');
    if (weekStart(input.weekStart) !== input.weekStart) throw new ValidationFailedError('周报必须从周一开始');
    const loaded = await loadOutside(deps, input.weekStart);
    const at = deps.clock.now();
    const id = deps.ids.next();
    await deps.uow.run(async (tx) => {
      const previous = await tx.weeklyReports.findCurrent(previousWeek(input.weekStart));
      const current = await tx.weeklyReports.findCurrent(input.weekStart);
      const data = assembleWeeklyReport({
        weekStart: input.weekStart,
        facts: loaded.facts,
        previous: readReport(previous?.data),
        sources: loaded.sources,
      });
      const management = tx.managementMeeting;
      const snapshot = management === undefined ? data : {
        ...data,
        managementMeeting: await meetingSnapshots(management, input.weekStart),
      };
      if (current !== undefined) await tx.weeklyReports.save({ ...current, supersededBy: id, updatedAt: at });
      await tx.weeklyReports.save(frozen({ id, start: input.weekStart, actor, at, data: snapshot }));
      await tx.audit.record(auditOf({ action: 'report.generate', subject: { id }, ctx: { actor, at, entity: '周报' } }));
    });
    return { reportId: id };
  };

async function meetingSnapshots(repository: ManagementMeetingRepository, start: LocalDate): Promise<readonly ManagementMeetingSnapshot[]> {
  const snapshots: ManagementMeetingSnapshot[] = [];
  for (const store of MANAGEMENT_MEETING_STORES) snapshots.push(await repository.load(meetingPeriod({ store, weekStart: start })));
  return snapshots;
}

async function loadOutside(deps: GenerateWeeklyReportDeps, start: LocalDate) {
  const facts = await deps.performance.load({ from: start, to: weekEnd(start) });
  const freshness = await deps.freshness.load();
  return {
    facts: { ...facts, kpi: { ...facts.kpi, from: start, to: weekEnd(start) } },
    sources: freshness.sources,
  };
}

function readReport(data: unknown): WeeklyReportData | null {
  return unpackWeekly(data)?.report ?? null;
}

function frozen(input: { readonly id: EntityId; readonly start: LocalDate; readonly actor: Actor; readonly at: string; readonly data: WeeklyReportData }): StoredReport {
  return {
    id: input.id,
    createdAt: input.at,
    updatedAt: input.at,
    weekStart: input.start,
    generatedAt: input.at,
    generatedBy: input.actor.id,
    data: structuredClone(packWeekly({ report: input.data, generatedByName: input.actor.name })),
    dataWatermark: input.data.notes.sources,
    exports: [],
    supersededBy: null,
  };
}
