import { AsyncLocalStorage } from 'node:async_hooks';
import {
  activeAdminActor,
  makeExportWeeklyReport,
  makeGenerateWeeklyReport,
  makeGetWeeklyReport,
  makeListWeeklyReports,
  makeManagementMeeting,
  makePublishWeeklyReportToFeishu,
  requirePrintReportId,
  unconfiguredFeishuPublisher,
} from '@sw/application';
import type { LocalDate } from '@sw/domain';
import { browserRenderers, feishuPublisher, renderWeeklyPrintHtml, renderXlsx } from '@sw/report-renderers';
import {
  auditRepository, directorBrands,
  createUnitOfWork,
  fileStore,
  freshnessQueries,
  performanceQueries,
  managementMeetingRepository,
  type LoadManagementMeetingDevelopment,
  placeholderStores,
  reportingQueries,
  requireDatabase,
  userRepository,
  type AppDatabase,
} from '@sw/persistence';
import type { FeishuApp } from '../config.js';
import type { ReportingApi } from '../http/reporting/routes.js';
import { printExpiry, signPrintToken } from '../http/reporting/token.js';
import { systemClock } from '../system/clock.js';
import { systemIds } from '../system/ids.js';

type Clock = { now(): string; today(): LocalDate };
const printReportIds = new AsyncLocalStorage<string>();

export function register(): never {
  throw new Error('周报路由由 buildHttpApp 挂载');
}

export function composeReporting(input: {
  readonly db: AppDatabase;
  readonly files?: ReturnType<typeof fileStore>;
  readonly timeZone: string;
  readonly secret: string;
  readonly printOrigin?: () => string;
  readonly clock?: Clock;
  readonly feishu?: FeishuApp;
  readonly schedule?: ReportingApi['schedule'];
  readonly loadDevelopment?: LoadManagementMeetingDevelopment;
}): ReportingApi {
  const clock = input.clock ?? systemClock(input.timeZone);
  const ids = systemIds();
  const reports = reportingQueries(input.db);
  const uow = createUnitOfWork(input.db, (tx) => stores({
    db: requireDatabase(tx), timeZone: input.timeZone,
    ...(input.loadDevelopment === undefined ? {} : { loadDevelopment: input.loadDevelopment }),
  }));
  const generate = makeGenerateWeeklyReport({
    uow,
    clock,
    ids,
    performance: performanceQueries({ db: input.db, clock, timeZone: input.timeZone }),
    freshness: freshnessQueries(input.db),
  });
  return {
    ...apiOf({ input, clock, ids, reports, uow, generate, feishu: input.feishu }),
    brands: () => directorBrands(input.db),
    schedule: input.schedule ?? (async () => ({ brands: [], projects: [] })),
    managementMeeting: makeManagementMeeting({ uow, clock, ids, timeZone: input.timeZone }),
  };
}

function apiOf(ctx: {
  readonly input: { readonly db: AppDatabase; readonly files?: ReturnType<typeof fileStore>; readonly secret: string; readonly printOrigin?: () => string };
  readonly clock: Clock;
  readonly ids: ReturnType<typeof systemIds>;
  readonly reports: ReturnType<typeof reportingQueries>;
  readonly uow: ReturnType<typeof createUnitOfWork>;
  readonly generate: ReportingApi['generate'];
  readonly feishu: FeishuApp | undefined;
}): Omit<ReportingApi, 'brands' | 'schedule'> {
  return {
    generate: ctx.generate,
    list: makeListWeeklyReports({ reports: ctx.reports }),
    get: makeGetWeeklyReport({ reports: ctx.reports }),
    exportReport: (input, actor) => printReportIds.run(input.reportId, () => exportOf(ctx)(input, actor)),
    publish: makePublishWeeklyReportToFeishu({
      reports: ctx.reports,
      publisher: publisherOf(ctx.feishu),
      uow: ctx.uow,
      clock: ctx.clock,
    }),
    feishuConfigured: ctx.feishu !== undefined,
    renderPrintHtml: renderWeeklyPrintHtml,
    secret: ctx.input.secret,
    nowMs: () => Date.parse(ctx.clock.now()),
    printUrlFor: (reportId) => printUrl({ secret: ctx.input.secret, nowIso: ctx.clock.now(), reportId }),
    generateScheduled: (weekStart) => generateScheduled({ db: ctx.input.db, generate: ctx.generate, weekStart }),
  };
}

function publisherOf(feishu: FeishuApp | undefined) {
  return feishu === undefined ? unconfiguredFeishuPublisher() : feishuPublisher({ appId: feishu.appId, appSecret: feishu.appSecret, folderToken: feishu.folderToken });
}

function exportOf(ctx: {
  readonly input: { readonly files?: ReturnType<typeof fileStore>; readonly secret: string; readonly printOrigin?: () => string };
  readonly clock: Clock;
  readonly ids: ReturnType<typeof systemIds>;
  readonly reports: ReturnType<typeof reportingQueries>;
  readonly uow: ReturnType<typeof createUnitOfWork>;
}) {
  const printUrlFor = (reportId: string) => printUrl({ secret: ctx.input.secret, nowIso: ctx.clock.now(), reportId });
  return makeExportWeeklyReport({
    reports: ctx.reports,
    renderers: [{ format: 'xlsx', render: renderXlsx }, ...browserRenderers({ printUrlFor, reportId: currentReportId, ...(ctx.input.printOrigin === undefined ? {} : { origin: ctx.input.printOrigin }) })],
    files: ctx.input.files ?? missingFiles(),
    ids: ctx.ids,
    uow: ctx.uow,
    clock: ctx.clock,
  });
}

function currentReportId(): string {
  return requirePrintReportId(printReportIds.getStore());
}

function missingFiles(): ReturnType<typeof fileStore> {
  return {
    put: async () => { throw new Error('定时生成不写文件'); },
    read: async () => undefined,
  };
}

function printUrl({ secret, nowIso, reportId }: { readonly secret: string; readonly nowIso: string; readonly reportId: string }): string {
  const token = signPrintToken({ reportId, secret, exp: printExpiry(nowIso) });
  return `/api/v1/reports/weekly/${reportId}/print?token=${encodeURIComponent(token)}`;
}

async function generateScheduled({ db, generate, weekStart }: { readonly db: AppDatabase; readonly generate: ReportingApi['generate']; readonly weekStart: LocalDate }): Promise<void> {
  const actor = await activeAdminActor(userRepository(db));
  await generate({ weekStart }, actor);
}

function stores(input: Parameters<typeof managementMeetingRepository>[0]) {
  const { db } = input;
  return {
    ...placeholderStores(), weeklyReports: reportingQueries(db), audit: auditRepository(db),
    managementMeeting: managementMeetingRepository(input),
  };
}
