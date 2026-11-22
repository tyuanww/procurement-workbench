import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { AuthProvider, RouteReply, RouteRequest } from '@sw/auth';
import type { SessionUser } from '@sw/contracts';
import { HttpError, errorBody } from './plugins/errors.js';
import { canRead } from './read-access.js';
import './actor.js';

export type HttpApp = FastifyInstance;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
};

export async function buildHttpApp(input: { readonly auth: AuthProvider; readonly register: (app: FastifyInstance) => void; readonly serveWebDir?: string }): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest('actor', undefined);
  // eslint-disable-next-line max-params
  app.setErrorHandler((error, _req, reply) => {
    const mapped = errorBody(error);
    reply.code(mapped.status).send(mapped.body);
  });
  app.addHook('preHandler', async (req) => {
    req.actor = await input.auth.resolve(toRequest(req));
    if (req.actor !== undefined && isReadRequest(req) && !canRead(req.actor, apiPathOf(req.url))) {
      throw new HttpError({ code: 'FORBIDDEN', message: '当前角色不能读取这个资源' });
    }
  });
  input.auth.registerRoutes({
    get: (routePath, handler) => { app.get(routePath, (req, reply) => handler(toRequest(req), toReply(reply))); },
    post: (routePath, handler) => { app.post(routePath, (req, reply) => handler(toRequest(req), toReply(reply))); },
  });
  input.register(app);
  if (input.serveWebDir !== undefined) mountWeb(app, input.serveWebDir);
  return app;
}

function isReadRequest(req: FastifyRequest): boolean {
  return (req.method === 'GET' || req.method === 'HEAD') && req.url.startsWith('/api/v1/');
}

function apiPathOf(url: string): string {
  return url.split('?')[0] ?? '/';
}

export function requireActor(req: FastifyRequest): SessionUser {
  if (req.actor === undefined) throw new HttpError({ code: 'UNAUTHENTICATED', message: '没登录或会话过期' });
  return req.actor;
}

function toRequest(req: FastifyRequest): RouteRequest {
  const headers = Object.fromEntries(Object.entries(req.headers).flatMap(([name, value]) => {
    const normalized = header(value);
    return normalized === undefined ? [] : [[name, normalized]];
  }));
  return { headers, ip: req.ip, body: req.body, query: req.query };
}

function toReply(reply: FastifyReply): RouteReply {
  return {
    header: (name, value) => { reply.header(name, value); },
    code: (status) => { reply.code(status); return toReply(reply); },
    send: (body) => reply.send(body),
  };
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function mountWeb(app: FastifyInstance, dir: string): void {
  const root = path.resolve(dir);
  const handler = (req: FastifyRequest, reply: FastifyReply) => sendWeb({ root, req, reply });
  app.get('/', handler);
  app.get('/*', handler);
}

async function sendWeb({ root, req, reply }: { readonly root: string; readonly req: FastifyRequest; readonly reply: FastifyReply }) {
  const url = req.url.split('?')[0] ?? '/';
  if (url.startsWith('/api/') || url.startsWith('/files/')) return reply.callNotFound();
  const file = await readableFile(root, url);
  if (file === undefined) return reply.callNotFound();
  return reply.type(mimeOf(file)).send(createReadStream(file));
}

async function readableFile(root: string, url: string): Promise<string | undefined> {
  const relative = url === '/' ? 'index.html' : decode(url.slice(1));
  if (relative === undefined || safeJoin(root, relative) === undefined) return undefined;
  const direct = await fileAt(root, relative);
  if (direct !== undefined) return direct;
  if (path.extname(relative) !== '') return undefined;
  return fileAt(root, 'index.html');
}

async function fileAt(root: string, relative: string): Promise<string | undefined> {
  const file = safeJoin(root, relative);
  if (file === undefined || !await isFile(file) || !await staysInside(root, file)) return undefined;
  return file;
}

async function staysInside(root: string, file: string): Promise<boolean> {
  const realRoot = await realpath(root);
  const realFile = await realpath(file);
  return realFile === realRoot || realFile.startsWith(`${realRoot}${path.sep}`);
}

function safeJoin(root: string, relative: string): string | undefined {
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return undefined;
  return file;
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function decode(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
  }
}

function mimeOf(file: string): string {
  return MIME[path.extname(file)] ?? 'application/octet-stream';
}
