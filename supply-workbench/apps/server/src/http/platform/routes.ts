import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AuthModeSchema, CreateUserRequestSchema, LocalDateSchema, MeResponseSchema, SessionMetaSchema, UpdateSettingsRequestSchema, UpdateUserRequestSchema } from '@sw/contracts';
import { z } from 'zod';
import type { PlatformApi } from '../platform-api.js';
import { requireActor } from '../app.js';
import { HttpError } from '../plugins/errors.js';
import { parse } from '../parse.js';
import { wire } from '../wire.js';
import { systemClock } from '../../system/clock.js';

const EmptyQuery = z.object({}).strict();
const IdParams = z.object({ id: z.string().min(1) }).strict();
const AuditQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(200).optional(),
  entity: z.string().optional(),
  entityId: z.string().optional(),
  actorUserId: z.string().optional(),
  from: LocalDateSchema.optional(),
  to: LocalDateSchema.optional(),
}).strict();

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 50;

export function registerPlatformRoutes(input: { readonly app: FastifyInstance; readonly api: PlatformApi; readonly devLogin: boolean; readonly businessTimeZone: string }): void {
  const { app, api } = input;
  app.get('/api/v1/health', async (req, reply) => {
    const result = await health(api, req.query);
    reply.code(result.ok ? 200 : 503);
    return result;
  });
  app.get('/api/v1/me', async (req) => wire(MeResponseSchema, readMe(req, input.devLogin)));
  app.get('/api/v1/meta/session', async (req) => wire(SessionMetaSchema, readSessionMeta(req, input.businessTimeZone)));
  app.get('/api/v1/meta/auth', async (req) => wire(AuthModeSchema, authMeta(req, input.devLogin)));
  app.get('/api/v1/meta/freshness', async (req) => freshness(api, req));
  app.get('/api/v1/settings', async (req) => settings(api, req));
  app.put('/api/v1/settings', async (req) => saveSettings({ api, actor: requireActor(req), body: req.body }));
  app.get('/api/v1/users', async (req) => readUsers(api, req));
  app.post('/api/v1/users', async (req) => createUser({ api, actor: requireActor(req), body: req.body }));
  app.patch('/api/v1/users/:id', async (req) => updateUser(api, req));
  app.get('/api/v1/audit', async (req) => listAudit({ api, actor: requireActor(req), query: req.query }));
  app.get('/files/:id', async (req, reply) => sendFile({ api, req, reply }));
}

function authMeta(req: FastifyRequest, devLogin: boolean) {
  parse(EmptyQuery, req.query);
  return { mode: devLogin ? 'dev' as const : 'feishu' as const };
}

function readSessionMeta(req: FastifyRequest, timeZone: string) {
  parse(EmptyQuery, req.query);
  requireActor(req);
  return { businessTimeZone: timeZone, businessDate: systemClock(timeZone).today() };
}

function health(api: PlatformApi, query: unknown) {
  parse(EmptyQuery, query);
  return api.health();
}

function readMe(req: FastifyRequest, devLogin: boolean) {
  parse(EmptyQuery, req.query);
  return { ...requireActor(req), devLogin };
}

function freshness(api: PlatformApi, req: FastifyRequest) {
  parse(EmptyQuery, req.query);
  return api.getFreshness({}, requireActor(req));
}

function settings(api: PlatformApi, req: FastifyRequest) {
  parse(EmptyQuery, req.query);
  return api.getSettings({}, requireActor(req));
}

function readUsers(api: PlatformApi, req: FastifyRequest) {
  parse(EmptyQuery, req.query);
  return api.listUsers({}, requireActor(req));
}

async function saveSettings({ api, actor, body }: { readonly api: PlatformApi; readonly actor: ReturnType<typeof requireActor>; readonly body: unknown }) {
  await api.updateSettings({ patch: parse(UpdateSettingsRequestSchema, body) }, actor);
  return api.getSettings({}, actor);
}

async function createUser({ api, actor, body }: { readonly api: PlatformApi; readonly actor: ReturnType<typeof requireActor>; readonly body: unknown }) {
  const created = await api.createUser(parse(CreateUserRequestSchema, body), actor);
  return userView({ api, actor, userId: created.userId });
}

async function updateUser(api: PlatformApi, req: FastifyRequest) {
  parse(EmptyQuery, req.query);
  const actor = requireActor(req);
  const id = parse(IdParams, req.params).id;
  await api.updateUser({ userId: id, ...parse(UpdateUserRequestSchema, req.body) }, actor);
  return userView({ api, actor, userId: id });
}

async function userView({ api, actor, userId }: { readonly api: PlatformApi; readonly actor: ReturnType<typeof requireActor>; readonly userId: string }) {
  const users = await api.listUsers({}, actor);
  const view = users.find((user) => user.id === userId);
  if (view === undefined) throw new HttpError({ code: 'NOT_FOUND', message: '用户不存在', details: { entity: '用户', id: userId } });
  return view;
}

async function listAudit({ api, actor, query }: { readonly api: PlatformApi; readonly actor: ReturnType<typeof requireActor>; readonly query: unknown }) {
  return api.listAudit(auditQuery(parse(AuditQuerySchema, query)), actor);
}

function auditQuery(parsed: z.output<typeof AuditQuerySchema>) {
  return {
    page: parsed.page ?? DEFAULT_PAGE,
    pageSize: parsed.pageSize ?? DEFAULT_PAGE_SIZE,
    ...(parsed.entity === undefined ? {} : { entity: parsed.entity }),
    ...(parsed.entityId === undefined ? {} : { entityId: parsed.entityId }),
    ...(parsed.actorUserId === undefined ? {} : { actorUserId: parsed.actorUserId }),
    ...(parsed.from === undefined ? {} : { from: parsed.from }),
    ...(parsed.to === undefined ? {} : { to: parsed.to }),
  };
}

const FILE_SHA256 = /^[a-f0-9]{64}$/;

async function sendFile({ api, req, reply }: { readonly api: PlatformApi; readonly req: FastifyRequest; readonly reply: FastifyReply }) {
  parse(EmptyQuery, req.query);
  requireActor(req);
  const id = parse(IdParams, req.params).id;
  if (!FILE_SHA256.test(id)) throw new HttpError({ code: 'NOT_FOUND', message: '文件不存在', details: { entity: '文件', id } });
  const bytes = await api.files.read(id);
  if (bytes === undefined) throw new HttpError({ code: 'NOT_FOUND', message: '文件不存在', details: { entity: '文件', id } });
  return reply.type('application/octet-stream').send(Buffer.from(bytes));
}
