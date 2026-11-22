import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  CompleteManagementDecisionSchema,
  EntityIdSchema,
  ManagementDecisionSchema,
  ManagementMeetingQuerySchema,
  ManagementMeetingSchema,
  RecordManagementDecisionSchema,
  ExportWeeklyReportRequestSchema,
  FeishuPublishResultSchema,
  GenerateWeeklyReportRequestSchema,
  WeeklyReportDetailSchema,
} from '@sw/contracts';
import { z } from 'zod';
import type {
  ExportWeeklyReport,
  GenerateWeeklyReport,
  GetWeeklyReport,
  ListWeeklyReports,
  makeManagementMeeting,
  PublishWeeklyReportToFeishu,
  WeeklyReport,
} from '@sw/application';
import { requireActor } from '../app.js';
import { HttpError } from '../plugins/errors.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';
import { verifyPrintToken } from './token.js';

const IdParams = z.object({ id: z.string().min(1) }).strict();

export type ReportingApi = {
  readonly generate: GenerateWeeklyReport;
  readonly managementMeeting?: ReturnType<typeof makeManagementMeeting>;
  readonly list: ListWeeklyReports;
  readonly get: GetWeeklyReport;
  readonly exportReport: ExportWeeklyReport;
  readonly publish: PublishWeeklyReportToFeishu;
  readonly feishuConfigured: boolean;
  readonly secret: string;
  nowMs(): number;
  printUrlFor(reportId: string): string;
  renderPrintHtml(report: WeeklyReport): string;
  generateScheduled(weekStart: Parameters<GenerateWeeklyReport>[0]['weekStart']): Promise<void>;
};

export function registerReportingRoutes(app: FastifyInstance, api: ReportingApi): void {
  if (api.managementMeeting !== undefined) registerManagementMeetingRoutes(app, api.managementMeeting);
  app.post('/api/v1/reports/weekly', async (req) => create(api, req));
  app.get('/api/v1/reports/weekly', async (req) => api.list(pageQuery(req), requireActor(req)));
  app.get('/api/v1/reports/weekly/:id', async (req) => detail(api, req));
  app.get('/api/v1/reports/weekly/:id/print', async (req, reply) => printData({ api, req, reply }));
  app.post('/api/v1/reports/weekly/:id/exports', async (req) => exportReport(api, req));
  app.post('/api/v1/reports/weekly/:id/feishu', async (req) => publishReport(api, req));
}

function registerManagementMeetingRoutes(app: FastifyInstance, meetings: ReturnType<typeof makeManagementMeeting>): void {
  const route = '/api/v1/dashboard/management-meeting';
  app.get('/api/v1/dashboard/management-meeting', async (req) => wire(ManagementMeetingSchema, await meetings.read(
    parse(ManagementMeetingQuerySchema, req.query), requireActor(req),
  )));
  app.post(`${route}/decisions`, async (req) => wire(ManagementDecisionSchema, await meetings.record(
    parse(RecordManagementDecisionSchema, req.body), requireActor(req),
  )));
  app.post(`${route}/decisions/:id/complete`, async (req) => wire(ManagementDecisionSchema, await meetings.complete(
    { ...parse(CompleteManagementDecisionSchema, req.body), id: parse(EntityIdSchema, idOf(req)) }, requireActor(req),
  )));
}

async function detail(api: ReportingApi, req: FastifyRequest) {
  const report = await api.get({ reportId: idOf(req) }, requireActor(req));
  return wire(WeeklyReportDetailSchema, { ...report, feishuConfigured: api.feishuConfigured });
}

async function publishReport(api: ReportingApi, req: FastifyRequest) {
  const published = await api.publish({ reportId: idOf(req) }, requireActor(req));
  return wire(FeishuPublishResultSchema, published);
}

async function create(api: ReportingApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const created = await api.generate(parse(GenerateWeeklyReportRequestSchema, req.body), actor);
  return api.get({ reportId: created.reportId }, actor);
}

async function exportReport(api: ReportingApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const body = parse(ExportWeeklyReportRequestSchema, req.body);
  return api.exportReport({ reportId: idOf(req), format: body.format }, actor);
}

async function printData({ api, req, reply }: { readonly api: ReportingApi; readonly req: FastifyRequest; readonly reply: FastifyReply }) {
  const reportId = idOf(req);
  const token = tokenOf(req);
  if (!verifyPrintToken({ token, reportId, secret: api.secret, nowMs: api.nowMs() })) {
    throw new HttpError({ code: 'UNAUTHENTICATED', message: '打印令牌无效或已过期' });
  }
  const report = await api.get({ reportId }, { id: parse(EntityIdSchema, 'print'), name: '打印', roles: ['manager'] });
  if (!wantsHtml(req)) return report;
  reply.type('text/html; charset=utf-8');
  return api.renderPrintHtml(report);
}

function wantsHtml(req: FastifyRequest): boolean {
  const accept = req.headers.accept;
  return typeof accept === 'string' && accept.includes('text/html');
}

function tokenOf(req: FastifyRequest): string {
  const raw = isRecord(req.query) ? req.query.token : undefined;
  return typeof raw === 'string' ? raw : '';
}

function pageQuery(req: FastifyRequest) {
  const raw = isRecord(req.query) ? req.query : {};
  const page = numberOf(raw.page);
  const pageSize = numberOf(raw.pageSize);
  return { ...(page === undefined ? {} : { page }), ...(pageSize === undefined ? {} : { pageSize }) };
}

function numberOf(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value === '' || Number.isNaN(Number(value))) return undefined;
  return Number(value);
}

function idOf(req: FastifyRequest): string {
  return parse(IdParams, req.params).id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
