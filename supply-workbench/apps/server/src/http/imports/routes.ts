import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import { DetectResponseSchema, ImportActionSchema, ImportBatchSummarySchema, ImportDecisionsRequestSchema, ImportStatusSchema, IssueCodeSchema, ProcurementPreviewSelectionSchema, StartImportRequestSchema, TemplateIdSchema } from '@sw/contracts';
import { z } from 'zod';
import { HttpError } from '../plugins/errors.js';
import { requireActor } from '../app.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';

const ALLOWED = new Set(['csv', 'xlsx']);
const IMPORT_FILE_MAX_BYTES = 50 * 1024 * 1024;
const MULTIPART_OVERHEAD = 1024 * 1024;
const PAGE_MAX = 200;
const CommandRequestSchema = z.object({ expectedRevision: z.number().int().nonnegative().optional() }).strict();
const DecisionsCommandSchema = ImportDecisionsRequestSchema.extend({ expectedRevision: z.number().int().nonnegative().optional() });

const IdParams = z.object({ id: z.string().min(1) }).strict();
const ListQuery = z.object({
  template: TemplateIdSchema.optional(),
  status: ImportStatusSchema.optional(),
  factoryPartyId: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(PAGE_MAX).optional(),
}).strict();
const RowsQuery = z.object({
  action: ImportActionSchema.optional(),
  issueCode: IssueCodeSchema.optional(),
  sheet: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(PAGE_MAX).optional(),
}).strict();
const ProcurementPreviewQuery = z.object({ oa: z.string().max(256).optional() }).strict();

export type ImportApi = {
  detect(input: { readonly fileName: string; readonly mime: string; readonly bytes: Uint8Array }, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  start(input: z.infer<typeof StartImportRequestSchema> & { readonly coverageAttestationToken?: string }, actor: ReturnType<typeof requireActor>): Promise<{ readonly importBatchId: string }>;
  commit(id: string, actor: ReturnType<typeof requireActor>, meta?: { readonly expectedRevision?: number | undefined; readonly idempotencyKey?: string | undefined }): Promise<{ readonly importBatchId: string }>;
  discard(id: string, actor: ReturnType<typeof requireActor>, meta?: { readonly expectedRevision?: number | undefined; readonly idempotencyKey?: string | undefined }): Promise<{ readonly importBatchId: string }>;
  decide(input: { readonly importBatchId: string; readonly decisions: z.infer<typeof ImportDecisionsRequestSchema>; readonly expectedRevision?: number | undefined; readonly idempotencyKey?: string | undefined }, actor: ReturnType<typeof requireActor>): Promise<{ readonly importBatchId: string }>;
  get(input: { readonly importBatchId: string }, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  procurementPreview(input: { readonly importBatchId: string } & z.infer<typeof ProcurementPreviewQuery>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  list(input: z.infer<typeof ListQuery>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  rows(input: { readonly importBatchId: string } & z.infer<typeof RowsQuery>, actor: ReturnType<typeof requireActor>): Promise<unknown>;
  template(actor: ReturnType<typeof requireActor>): Promise<{ readonly bytes: Uint8Array; readonly fileName: string }>;
};

export function registerImportRoutes(app: FastifyInstance, api: ImportApi): void {
  app.register(multipart, { limits: { fileSize: IMPORT_FILE_MAX_BYTES } }).after(() => {
    app.post('/api/v1/imports/detect', { bodyLimit: IMPORT_FILE_MAX_BYTES + MULTIPART_OVERHEAD }, async (req) => detect(api, req));
    app.post('/api/v1/imports', async (req) => afterStart(api, req));
    app.get('/api/v1/imports', async (req) => api.list(parse(ListQuery, req.query), requireActor(req)));
    app.get('/api/v1/imports/:id', async (req) => wire(ImportBatchSummarySchema, await api.get({ importBatchId: idOf(req) }, requireActor(req))));
    app.get('/api/v1/imports/:id/procurement', async (req) => wire(ProcurementPreviewSelectionSchema, await api.procurementPreview({ importBatchId: idOf(req), ...parse(ProcurementPreviewQuery, req.query) }, requireActor(req))));
    app.get('/api/v1/imports/:id/rows', async (req) => api.rows({ importBatchId: idOf(req), ...parse(RowsQuery, req.query) }, requireActor(req)));
    app.put('/api/v1/imports/:id/decisions', async (req) => afterDecide(api, req));
    app.post('/api/v1/imports/:id/commit', async (req) => afterCommand({ api, command: api.commit, req }));
    app.post('/api/v1/imports/:id/discard', async (req) => afterCommand({ api, command: api.discard, req }));
    app.get('/api/v1/templates/factory-progress-v1.xlsx', async (req, reply) => sendTemplate({ api, req, reply }));
  });
}

async function detect(api: ImportApi, req: FastifyRequest) {
  const file = await readFile(req);
  assertUpload({ fileName: file.filename, bytes: file.bytes });
  return wire(DetectResponseSchema, await api.detect({ fileName: file.filename, mime: file.mimetype, bytes: file.bytes }, requireActor(req)));
}

async function readFile(req: FastifyRequest): Promise<{ readonly filename: string; readonly mimetype: string; readonly bytes: Buffer }> {
  try {
    const file = await req.file();
    if (file === undefined) throw new HttpError({ code: 'FILE_TYPE_NOT_ALLOWED', message: '文件类型不允许' });
    return { filename: file.filename, mimetype: file.mimetype, bytes: await file.toBuffer() };
  } catch (error) {
    if (isTooLarge(error)) throw new HttpError({ code: 'FILE_TOO_LARGE', message: '超过大小上限', details: { kind: 'import' } });
    throw error;
  }
}

export function assertUpload(input: { readonly fileName: string; readonly bytes: Uint8Array }): void {
  const ext = input.fileName.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED.has(ext)) throw new HttpError({ code: 'FILE_TYPE_NOT_ALLOWED', message: '文件类型不允许' });
  if (input.bytes.byteLength > IMPORT_FILE_MAX_BYTES) throw new HttpError({ code: 'FILE_TOO_LARGE', message: '超过大小上限', details: { kind: 'import' } });
}

async function afterStart(api: ImportApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const body = parse(StartImportRequestSchema, req.body);
  const attestation = headerOf(req, 'x-import-coverage-attestation');
  const started = await api.start({ ...body, ...(attestation === undefined ? {} : { coverageAttestationToken: attestation }) }, actor);
  return wire(ImportBatchSummarySchema, await api.get({ importBatchId: started.importBatchId }, actor));
}

async function afterDecide(api: ImportApi, req: FastifyRequest) {
  const actor = requireActor(req);
  const importBatchId = idOf(req);
  const command = parse(DecisionsCommandSchema, req.body);
  const { expectedRevision, ...decisions } = command;
  await api.decide({ importBatchId, decisions, expectedRevision, idempotencyKey: headerOf(req, 'idempotency-key') }, actor);
  return wire(ImportBatchSummarySchema, await api.get({ importBatchId }, actor));
}

async function afterCommand({ api, command, req }: { readonly api: ImportApi; readonly command: ImportApi['commit']; readonly req: FastifyRequest }) {
  const actor = requireActor(req);
  const importBatchId = idOf(req);
  const body = parse(CommandRequestSchema, req.body ?? {});
  await command(importBatchId, actor, { expectedRevision: body.expectedRevision, idempotencyKey: headerOf(req, 'idempotency-key') });
  return wire(ImportBatchSummarySchema, await api.get({ importBatchId }, actor));
}

async function sendTemplate({ api, req, reply }: { readonly api: ImportApi; readonly req: FastifyRequest; readonly reply: FastifyReply }) {
  const file = await api.template(requireActor(req));
  return reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(Buffer.from(file.bytes));
}

function idOf(req: FastifyRequest): string {
  return parse(IdParams, req.params).id;
}

function headerOf(req: FastifyRequest, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function isTooLarge(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'FST_REQ_FILE_TOO_LARGE';
}
