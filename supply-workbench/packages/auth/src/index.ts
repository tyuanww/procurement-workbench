import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ForbiddenError, RateLimitedError, UnauthenticatedError, ValidationFailedError } from '@sw/application/errors';
import { can } from '@sw/domain';
import type { Actor } from '../../application/src/shared/actor.js';
import type { UserDirectory } from '../../application/src/ports/user-directory.js';
import type { OAuthStateStore } from '../../application/src/ports/oauth-state-store.js';
import type { FeishuOAuthClient } from './feishu-oauth.js';

const COOKIE = 'sw_session';
const OAUTH_NONCE_COOKIE = 'sw_oauth_nonce';
const SESSION_SECONDS = 12 * 60 * 60;
const OAUTH_NONCE_SECONDS = 5 * 60;
const MS_PER_SECOND = 1000;

export type RouteApp = {
  get(path: string, handler: (req: RouteRequest, reply: RouteReply) => Promise<unknown>): void;
  post(path: string, handler: (req: RouteRequest, reply: RouteReply) => Promise<unknown>): void;
};

export type RouteRequest = { readonly headers: { readonly cookie?: string; readonly [name: string]: string | undefined }; readonly ip?: string; readonly body?: unknown; readonly query?: unknown };
export type RouteReply = { header(name: string, value: string | string[]): void; code(status: number): RouteReply; send(body?: unknown): unknown };

export type AuthProvider = {
  readonly mode: 'dev' | 'feishu';
  registerRoutes(app: RouteApp): void;
  resolve(req: RouteRequest): Promise<Actor | undefined>;
};

export function devAuth(input: { readonly directory: UserDirectory; readonly accessCode: string; readonly secret: string }): AuthProvider {
  const limiter = loginLimiter();
  return {
    mode: 'dev',
    registerRoutes(app) {
      app.get('/api/v1/auth/dev/users', async (req) => listDevUsers(input, req));
      app.post('/api/v1/auth/dev/login', (req, reply) => login({ input, req, reply, limiter }));
      app.post('/api/v1/auth/logout', (req, reply) => logout({ input: { ...input, secure: false }, req, reply }));
    },
    resolve: (req) => resolve(input, req),
  };
}

export type FeishuAuthInput = {
  readonly directory: UserDirectory;
  readonly appId: string;
  readonly appSecret: string;
  readonly secret: string;
  readonly oauth: { readonly client: FeishuOAuthClient; readonly states: OAuthStateStore; readonly redirectUri: string; readonly now?: () => string; readonly ttlSeconds?: number };
};

/**
 * Feishu 登录只接受已验证的 open_id 映射，不把周报目录令牌作为凭证。
 * 未接入上游身份断言时，默认拒绝所有 open_id，保持生产 fail-closed。
 */
export function feishuAuth(input: FeishuAuthInput): AuthProvider {
  void input.appId;
  void input.appSecret;
  return {
    mode: 'feishu',
    registerRoutes(app) {
      app.get('/api/v1/auth/feishu/start', (req, reply) => feishuStart({ input, req, reply }));
      app.get('/api/v1/auth/feishu/callback', (req, reply) => feishuCallback({ input, req, reply }));
      app.post('/api/v1/auth/logout', (req, reply) => logout({ input: { ...input, secure: true }, req, reply }));
    },
    resolve: (req) => resolve(input, req),
  };
}

async function listDevUsers(input: { readonly directory: UserDirectory; readonly secret: string }, req: RouteRequest): Promise<unknown> {
  rejectUnknownQuery(req.query);
  const actor = await resolve({ directory: input.directory, secret: input.secret }, req);
  if (actor === undefined) throw new UnauthenticatedError();
  if (!can(actor, 'admin')) throw new ForbiddenError('admin');
  return input.directory.listDevLoginUsers();
}

async function logout({ input, req, reply }: { readonly input: { readonly directory: UserDirectory; readonly secret: string; readonly secure: boolean }; readonly req: RouteRequest; readonly reply: RouteReply }): Promise<unknown> {
  rejectUnknownQuery(req.query);
  if (await resolve(input, req) === undefined) throw new UnauthenticatedError();
  reply.header('set-cookie', cleared(input.secure));
  reply.code(204);
  return reply.send();
}

async function login({ input, req, reply, limiter }: { readonly input: { readonly directory: UserDirectory; readonly accessCode: string; readonly secret: string }; readonly req: RouteRequest; readonly reply: RouteReply; readonly limiter: LoginLimiter }): Promise<unknown> {
  rejectUnknownQuery(req.query);
  if (!limiter.allowed(req.ip)) throw new RateLimitedError();
  const body = loginBody(req.body);
  if (body === undefined || !sameSecret(body.accessCode, input.accessCode)) {
    limiter.fail(req.ip);
    throw new UnauthenticatedError();
  }
  const actor = await input.directory.findActive(loginAccountId(body.userId));
  if (actor === undefined) {
    limiter.fail(req.ip);
    throw new UnauthenticatedError();
  }
  limiter.clear(req.ip);
  reply.header('set-cookie', sessionCookie({ userId: actor.id, secret: input.secret, secure: false }));
  return actor;
}

type LoginLimiter = {
  allowed(ip: string | undefined): boolean;
  fail(ip: string | undefined): void;
  clear(ip: string | undefined): void;
};

function loginLimiter(): LoginLimiter {
  const attempts = new Map<string, { readonly count: number; readonly resetAt: number }>();
  const limit = 5;
  const windowMs = 15 * 60 * 1000;
  return {
    allowed(ip) {
      if (ip === undefined) return true;
      const attempt = attempts.get(ip);
      return attempt === undefined || attempt.resetAt <= Date.now() || attempt.count < limit;
    },
    fail(ip) {
      if (ip === undefined) return;
      const now = Date.now();
      const attempt = attempts.get(ip);
      if (attempt === undefined || attempt.resetAt <= now) {
        attempts.set(ip, { count: 1, resetAt: now + windowMs });
        return;
      }
      attempts.set(ip, { count: attempt.count + 1, resetAt: attempt.resetAt });
    },
    clear(ip) {
      if (ip !== undefined) attempts.delete(ip);
    },
  };
}

async function feishuStart({ input, req, reply }: { readonly input: FeishuAuthInput; readonly req: RouteRequest; readonly reply: RouteReply }): Promise<unknown> {
  const returnTo = returnToOf(req.query);
  const now = input.oauth.now?.() ?? new Date().toISOString();
  const ttlSeconds = input.oauth.ttlSeconds ?? 300;
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  await input.oauth.states.issue({ stateHash: hashState(state), nonceHash: hashState(nonce), redirectUri: input.oauth.redirectUri, returnTo, createdAt: now, expiresAt: new Date(Date.parse(now) + ttlSeconds * MS_PER_SECOND).toISOString() });
  reply.header('set-cookie', oauthNonceCookie(nonce));
  reply.header('location', input.oauth.client.authorizeUrl({ state, redirectUri: input.oauth.redirectUri }));
  reply.code(302);
  return reply.send();
}

async function feishuCallback({ input, req, reply }: { readonly input: FeishuAuthInput; readonly req: RouteRequest; readonly reply: RouteReply }): Promise<unknown> {
  const query = callbackQuery(req.query);
  const now = input.oauth.now?.() ?? new Date().toISOString();
  const nonce = readCookie(req.headers.cookie, OAUTH_NONCE_COOKIE);
  if (nonce === undefined) throw new UnauthenticatedError();
  const state = await input.oauth.states.consume({ stateHash: hashState(query.state), nonceHash: hashState(nonce), at: now });
  if (state === undefined || state.redirectUri !== input.oauth.redirectUri) throw new UnauthenticatedError();
  try {
    const identity = await input.oauth.client.exchangeCode({ code: query.code, redirectUri: state.redirectUri });
    const actor = await input.directory.findActiveByFeishuOpenId(identity.openId);
    if (actor === undefined) throw new UnauthenticatedError();
    reply.header('set-cookie', [sessionCookie({ userId: actor.id, secret: input.secret, secure: true }), clearedOauthNonce()]);
    reply.header('location', state.returnTo);
    reply.code(302);
    return reply.send();
  } catch (error) {
    if (error instanceof UnauthenticatedError) throw error;
    throw new UnauthenticatedError();
  }
}

async function resolve(input: { readonly directory: UserDirectory; readonly secret: string }, req: RouteRequest): Promise<Actor | undefined> {
  const token = readCookie(req.headers.cookie);
  if (token === undefined) return undefined;
  const userId = verify(token, input.secret);
  if (userId === undefined) return undefined;
  return input.directory.findActive(userId);
}

const SEEDED_ADMIN_ID = '0199f0a0-0000-7000-8000-000000000001';

function loginAccountId(userId: string): string {
  return userId === 'admin' ? SEEDED_ADMIN_ID : userId;
}

function loginBody(value: unknown): { readonly userId: string; readonly accessCode: string } | undefined {
  const record = recordOf(value);
  if (record === undefined) return undefined;
  if (Object.keys(record).some((key) => key !== 'userId' && key !== 'accessCode')) {
    throw new ValidationFailedError('请求不合法', { field: 'body' });
  }
  if (typeof record.userId !== 'string' || typeof record.accessCode !== 'string') return undefined;
  return { userId: record.userId, accessCode: record.accessCode };
}

function callbackQuery(value: unknown): { readonly code: string; readonly state: string } {
  const record = recordOf(value);
  if (record === undefined || typeof record.code !== 'string' || record.code === '' || typeof record.state !== 'string' || record.state === '') throw new UnauthenticatedError();
  return { code: record.code, state: record.state };
}

function returnToOf(value: unknown): string {
  const record = recordOf(value);
  if (record === undefined || record.returnTo === undefined) return '/';
  if (typeof record.returnTo !== 'string' || !record.returnTo.startsWith('/') || record.returnTo.startsWith('//') || record.returnTo.includes('\\')) throw new ValidationFailedError('请求不合法', { field: 'returnTo' });
  return record.returnTo;
}

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

function rejectUnknownQuery(query: unknown): void {
  const record = recordOf(query);
  if (record === undefined || Object.keys(record).length === 0) return;
  throw new ValidationFailedError('请求不合法', { field: 'query' });
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return Object.fromEntries(Object.entries(value));
}

function sessionCookie(input: { readonly userId: string; readonly secret: string; readonly secure: boolean }): string {
  const exp = Math.floor(Date.now() / MS_PER_SECOND) + SESSION_SECONDS;
  const payload = `${input.userId}.${exp}`;
  return `${COOKIE}=${payload}.${sign(payload, input.secret)}; HttpOnly; Path=/; Max-Age=${SESSION_SECONDS}; SameSite=Lax${input.secure ? '; Secure' : ''}`;
}

function cleared(secure: boolean): string {
  return `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function readCookie(header: string | undefined, name = COOKIE): string | undefined {
  const parts = header?.split(';') ?? [];
  for (const part of parts) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

function oauthNonceCookie(nonce: string): string {
  return `${OAUTH_NONCE_COOKIE}=${nonce}; HttpOnly; Path=/api/v1/auth/feishu; Max-Age=${OAUTH_NONCE_SECONDS}; SameSite=Lax; Secure`;
}

function clearedOauthNonce(): string {
  return `${OAUTH_NONCE_COOKIE}=; HttpOnly; Path=/api/v1/auth/feishu; Max-Age=0; SameSite=Lax; Secure`;
}

function verify(token: string, secret: string): string | undefined {
  const [userId, exp, sig] = token.split('.');
  if (userId === undefined || exp === undefined || sig === undefined) return undefined;
  if (!sameSecret(sig, sign(`${userId}.${exp}`, secret))) return undefined;
  if (Number(exp) * MS_PER_SECOND < Date.now()) return undefined;
  return userId;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function sameSecret(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type { FeishuIdentity, FeishuOAuthClient } from './feishu-oauth.js';
export { feishuOAuthClient } from './feishu-oauth.js';
export type { OAuthStateStore } from '../../application/src/ports/oauth-state-store.js';
