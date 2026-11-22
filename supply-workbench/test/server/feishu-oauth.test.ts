import { expect, it } from 'vitest';
import { feishuAuth, feishuOAuthClient, type OAuthStateStore } from '../../packages/auth/src/index.js';
import { entityId } from '../../packages/domain/src/index.js';
import { buildHttpApp } from '../../apps/server/src/http/app.js';

const SECRET = '0123456789abcdef0123456789abcdef';

it('Feishu OAuth callback consumes state once and writes a Secure session', async () => {
  const states = new MemoryStateStore();
  const app = await buildHttpApp({
    auth: feishuAuth({
      directory: {
        async findActive() { return undefined; },
        async findActiveByFeishuOpenId(openId) { return openId === 'ou_admin' ? { id: entityId('admin-1'), name: '管理员', roles: ['admin'] } : undefined; },
        async listDevLoginUsers() { return []; },
      },
      appId: 'app-id',
      appSecret: 'app-secret',
      secret: SECRET,
      oauth: {
        states,
        redirectUri: 'https://supply.example.com/api/v1/auth/feishu/callback',
        now: () => '2026-11-08T00:00:00.000Z',
        client: {
          authorizeUrl({ state, redirectUri }) { return `https://feishu.example/auth?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`; },
          async exchangeCode({ code }) { expect(code).toBe('code-1'); return { openId: 'ou_admin', unionId: null }; },
        },
      },
    }),
    register: () => undefined,
  });
  const start = await app.inject({ method: 'GET', url: '/api/v1/auth/feishu/start?returnTo=%2Fdashboard' });
  expect(start.statusCode).toBe(302);
  const location = String(start.headers.location);
  const state = new URL(location).searchParams.get('state');
  expect(state).toBeTruthy();
  const missingNonce = await app.inject({ method: 'GET', url: `/api/v1/auth/feishu/callback?code=code-1&state=${encodeURIComponent(state ?? '')}` });
  expect(missingNonce.statusCode).toBe(401);
  const oauthCookie = String(start.headers['set-cookie']);
  const callback = await app.inject({ method: 'GET', url: `/api/v1/auth/feishu/callback?code=code-1&state=${encodeURIComponent(state ?? '')}`, headers: { cookie: oauthCookie.split(';')[0] } });
  expect(callback.statusCode).toBe(302);
  expect(callback.headers.location).toBe('/dashboard');
  expect(String(callback.headers['set-cookie'])).toContain('Secure');
  const replay = await app.inject({ method: 'GET', url: `/api/v1/auth/feishu/callback?code=code-1&state=${encodeURIComponent(state ?? '')}`, headers: { cookie: oauthCookie.split(';')[0] } });
  expect(replay.statusCode).toBe(401);
  await app.close();
});

it('Feishu OAuth client 只把授权码换成服务端用户身份', async () => {
  const calls: Array<{ readonly url: string; readonly init: RequestInit | undefined }> = [];
  const client = feishuOAuthClient({
    appId: 'app-id',
    appSecret: 'app-secret',
    fetcher: async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      calls.push({ url, init });
      if (url.endsWith('/access_token')) return new Response(JSON.stringify({ code: 0, data: { access_token: 'user-token' } }), { status: 200 });
      return new Response(JSON.stringify({ code: 0, data: { open_id: 'ou_admin', union_id: 'on_admin' } }), { status: 200 });
    },
  });
  expect(client.authorizeUrl({ state: 'state-1', redirectUri: 'https://supply.example.com/callback' })).toContain('app_id=app-id');
  await expect(client.exchangeCode({ code: 'code-1', redirectUri: 'https://supply.example.com/callback' })).resolves.toEqual({ openId: 'ou_admin', unionId: 'on_admin' });
  expect(calls).toHaveLength(2);
  expect(String(calls[0]?.init?.body)).toContain('authorization_code');
  expect(calls[1]?.init?.headers).toEqual({ authorization: 'Bearer user-token' });
});

class MemoryStateStore implements OAuthStateStore {
  private readonly values = new Map<string, { readonly redirectUri: string; readonly returnTo: string; readonly expiresAt: string; readonly nonceHash: string; used: boolean }>();

  async issue(input: { readonly stateHash: string; readonly nonceHash: string; readonly redirectUri: string; readonly returnTo: string; readonly expiresAt: string }): Promise<void> {
    this.values.set(input.stateHash, { redirectUri: input.redirectUri, returnTo: input.returnTo, expiresAt: input.expiresAt, nonceHash: input.nonceHash, used: false });
  }

  async consume(input: { readonly stateHash: string; readonly nonceHash: string; readonly at: string }): Promise<{ readonly redirectUri: string; readonly returnTo: string } | undefined> {
    const value = this.values.get(input.stateHash);
    if (value === undefined || value.used || value.nonceHash !== input.nonceHash || value.expiresAt <= input.at) return undefined;
    value.used = true;
    return { redirectUri: value.redirectUri, returnTo: value.returnTo };
  }
}
