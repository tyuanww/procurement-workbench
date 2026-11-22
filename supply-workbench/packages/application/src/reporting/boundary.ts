import type { Actor } from '../shared/actor.js';
import type { Clock } from '../ports/clock.js';
import type { DocumentPublisher } from '../ports/document-publisher.js';
import type { FileStore } from '../ports/file-store.js';
import type { FreshnessQueries } from '../ports/freshness-queries.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { PerformanceReadModel } from '../ports/performance-read-model.js';
import type { ReportRenderer } from '../ports/report-renderer.js';
import type { ManagementMeetingRepository } from './management-meeting.js';
import type { UnitOfWork, UnitOfWorkStores } from '../ports/unit-of-work.js';
import type { WeeklyReportRepository } from '../ports/weekly-report-repository.js';
import type { ListResult } from '../shared/page.js';
import type {
  ExportFileResult,
  ExportWeeklyReportInput,
  FeishuPublishResult,
  GenerateWeeklyReportInput,
  WeeklyReport,
  WeeklyReportIdInput,
  WeeklyReportListItem,
  WeeklyReportListQuery,
} from './views.js';

export type * from './views.js';

type GenerateDeps = {
  readonly uow: UnitOfWork<UnitOfWorkStores & { readonly managementMeeting?: ManagementMeetingRepository }>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly performance: PerformanceReadModel;
  readonly freshness: FreshnessQueries;
};

export type GenerateWeeklyReportDeps = GenerateDeps;
export type GenerateWeeklyReport = (input: GenerateWeeklyReportInput, actor: Actor) => Promise<{ readonly reportId: string }>;
export type ExportWeeklyReportDeps = {
  readonly reports: WeeklyReportRepository;
  readonly renderers: readonly ReportRenderer[];
  readonly files: FileStore;
  readonly ids: IdGenerator;
  readonly uow: UnitOfWork;
  readonly clock: Clock;
};
export type ExportWeeklyReport = (input: ExportWeeklyReportInput, actor: Actor) => Promise<ExportFileResult>;
export type PublishWeeklyReportToFeishuDeps = {
  readonly reports: WeeklyReportRepository;
  readonly publisher: DocumentPublisher;
  readonly uow: UnitOfWork;
  readonly clock: Clock;
};
export type PublishWeeklyReportToFeishu = (input: WeeklyReportIdInput, actor: Actor) => Promise<FeishuPublishResult>;
export type ListWeeklyReportsDeps = { readonly reports: WeeklyReportRepository };
export type ListWeeklyReports = (input: WeeklyReportListQuery, actor: Actor) => Promise<ListResult<WeeklyReportListItem>>;
export type GetWeeklyReportDeps = { readonly reports: WeeklyReportRepository };
export type GetWeeklyReport = (input: WeeklyReportIdInput, actor: Actor) => Promise<WeeklyReport>;
