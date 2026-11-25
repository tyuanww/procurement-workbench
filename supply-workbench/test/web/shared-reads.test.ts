import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import { loadDeskOwners } from '../../apps/web/src/pages/lines/list/owners.js';
import { loadToday } from '../../apps/web/src/pages/today/today-load.js';
import { loadShellToday } from '../../apps/web/src/features/shell/use-shell.js';
import { apiSend } from '../../apps/web/src/shared/api/client.js';
import { dropFor } from '../../apps/web/src/shared/api/drops.js';
import { ReadCancelled } from '../../apps/web/src/shared/api/flights.js';
import { emptyReads, read } from '../../apps/web/src/shared/api/reads.js';
import { RETAIN_MS } from '../../apps/web/src/shared/api/slots.js';

import { pagedToday } from './today-page-fixture.js';

const ME = { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true };

it('今日页和跟进台共享同一次 /me', async () => {
  const seen = await record(async () => {
    await loadToday();
    await loadDeskOwners({
      setUserId: () => undefined,
      setUsers: () => undefined,
      setOwnerVisible: () => undefined,
    });
  });
  expect(seen.filter((url) => url.includes('/api/v1/me'))).toEqual(['/api/v1/me']);
});

it('壳层和带待建批次的今日各自缓存', async () => {
  const seen = await record(async () => {
    await loadShellToday('mine');
    await read({ name: 'today', scope: 'mine', includePending: true });
    await read({ name: 'today', scope: 'mine', includePending: true });
    await loadShellToday('mine');
  });
  expect(seen.filter((url) => url.startsWith('/api/v1/today'))).toEqual(['/api/v1/today?scope=mine', '/api/v1/today?scope=mine&includePending=true']);
});

const SENTENCE = '没登录或会话过期。检查登录或网络后重试。';

it('/me、今日、订单行、排期的失败字幕是同一句', async () => {
  emptyReads();
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '服务器原文', details: null } }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
  try {
    await expect(read({ name: 'me' })).rejects.toThrow(SENTENCE);
    await expect(read({ name: 'today', scope: 'mine' })).rejects.toThrow(SENTENCE);
    await expect(read({ name: 'lines', query: 'page=1' })).rejects.toThrow(SENTENCE);
    await expect(read({ name: 'planDaily', date: '2026-11-10' })).rejects.toThrow(SENTENCE);
  } finally {
    globalThis.fetch = previous;
  }
});

it('取消一个等待者不会取消还要这份今日的人', async () => {
  emptyReads();
  let finish: ((response: Response) => void) | undefined;
  let calls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = () => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  };
  try {
    const kept = read({ name: 'today', scope: 'mine' });
    const controller = new AbortController();
    const dropped = read({ name: 'today', scope: 'mine', signal: controller.signal });
    controller.abort();
    await expect(dropped).rejects.toBeInstanceOf(ReadCancelled);
    finish?.(json(emptyToday()));
    await expect(kept).resolves.toMatchObject({ truncated: false });
    expect(calls).toBe(1);
  } finally {
    globalThis.fetch = previous;
  }
});

it('跟进写入让今日重读，进度备注不重读', async () => {
  const seen = await record(async () => {
    await read({ name: 'today', scope: 'mine' });
    await apiSend({ path: '/api/v1/follow-ups/latest-notes', method: 'POST', body: {}, schema: okSchema });
    await read({ name: 'today', scope: 'mine' });
    await apiSend({ path: '/api/v1/follow-ups', method: 'POST', body: {}, schema: okSchema });
    await read({ name: 'today', scope: 'mine' });
  });
  expect(seen.filter((url) => url.startsWith('/api/v1/today'))).toEqual([
    '/api/v1/today?scope=mine',
    '/api/v1/today?scope=mine',
  ]);
});

it('送货单和往来方写入会丢掉今日', () => {
  expect(dropFor({ path: '/api/v1/delivery-notes/note-1', sessionId: 'self' })?.families).toContain('today');
  expect(dropFor({ path: '/api/v1/delivery-notes/note-1/void', sessionId: 'self' })?.families).toContain('today');
  expect(dropFor({ path: '/api/v1/batches/batch-1/delivery-note', sessionId: 'self' })?.families).toContain('today');
  expect(dropFor({ path: '/api/v1/parties', sessionId: 'self' })?.families).toContain('today');
  expect(dropFor({ path: '/api/v1/parties/party-1', sessionId: 'self' })?.families).toContain('today');
});

it('写路径都有失效规则，四类 GET 不再散落在页面', () => {
  expect(dropFor({ path: '/api/v1/follow-ups/latest-notes', sessionId: 'self' })?.families).toEqual([]);
  expect(dropFor({ path: '/api/v1/follow-ups', sessionId: 'self' })?.families).toContain('today');
  expect(dropFor({ path: '/api/v1/imports/batch/commit', sessionId: 'self' })?.families).toContain('lines');
  expect(dropFor({ path: '/api/v1/settings', sessionId: 'self' })?.families).toEqual(['today']);
  expect(dropFor({ path: '/api/v1/auth/logout', sessionId: 'self' })?.isSessionEnd).toBe(true);
  expect(dropFor({ path: '/api/v1/users/self', sessionId: 'self' })?.families).toEqual(['me']);
  expect(dropFor({ path: '/api/v1/users/other', sessionId: 'self' })?.families).toEqual([]);
  const missed = writePaths().filter((path) => dropFor({ path, sessionId: 'self' }) === null);
  expect(missed).toEqual([]);
  expect(ownedGetsOutsideApi()).toEqual([]);
});

it('保留的今日和 /me 到点后会再请求', async () => {
  vi.useFakeTimers();
  try {
    const seen = await record(async () => {
      await read({ name: 'me' });
      await read({ name: 'today', scope: 'mine' });
      await read({ name: 'me' });
      await read({ name: 'today', scope: 'mine' });
      await vi.advanceTimersByTimeAsync(RETAIN_MS);
      await read({ name: 'me' });
      await read({ name: 'today', scope: 'mine' });
    });
    expect(seen.filter((url) => url.includes('/api/v1/me'))).toEqual(['/api/v1/me', '/api/v1/me']);
    expect(seen.filter((url) => url.startsWith('/api/v1/today'))).toEqual([
      '/api/v1/today?scope=mine',
      '/api/v1/today?scope=mine',
    ]);
  } finally {
    emptyReads();
    vi.useRealTimers();
  }
});

it('/me 失败时今日页仍返回今日', async () => {
  const loaded = await withFetch(async (url) => url.includes('/api/v1/me') ? denied() : json(pagedToday(emptyToday())), () => loadToday());
  expect(loaded).toMatchObject({ buyerName: '', items: [] });
});

it('今日失败时今日页仍然失败', async () => {
  await expect(withFetch(async (url) => url.startsWith('/api/v1/today') ? denied() : json(ME), () => loadToday())).rejects.toThrow(SENTENCE);
});

it('scope=all 和 scope=mine 不是同一份今日', async () => {
  const seen = await record(async () => {
    await loadShellToday('all');
    await loadToday();
  });
  expect(seen.filter((url) => url.startsWith('/api/v1/today'))).toEqual([
    '/api/v1/today?scope=all',
    '/api/v1/today?scope=mine&includePending=true&inbox=today&page=1&pageSize=50',
  ]);
});

async function withFetch<T>(respond: (url: string) => Response | Promise<Response>, run: () => Promise<T>): Promise<T> {
  emptyReads();
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => respond(requestUrl(input));
  try {
    return await run();
  } finally {
    globalThis.fetch = previous;
    emptyReads();
  }
}

async function record(run: () => Promise<void>): Promise<readonly string[]> {
  emptyReads();
  const seen: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    seen.push(url);
    if (url.includes('/api/v1/me')) return json(ME);
    if (url.startsWith('/api/v1/today')) return json(url.includes('pageSize=') ? pagedToday(emptyToday()) : emptyToday());
    return json({ ok: true });
  };
  try {
    await run();
    return seen;
  } finally {
    globalThis.fetch = previous;
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function denied(): Response {
  return new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '服务器原文', details: null } }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

const okSchema = {
  safeParse(value: unknown): { success: true; data: { ok: boolean } } | { success: false } {
    if (typeof value === 'object' && value !== null && 'ok' in value && typeof value.ok === 'boolean') {
      return { success: true, data: { ok: value.ok } };
    }
    return { success: false };
  },
};

function writePaths(): readonly string[] {
  const found = new Set<string>();
  for (const file of walk(fileURLToPath(new URL('../../apps/web/src', import.meta.url)))) {
    if (file.includes('/shared/api/')) continue;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/path:\s*`(\/api\/v1\/[^`]*)`/g)) found.add(headOf(match[1] ?? ''));
    for (const match of source.matchAll(/path:\s*'(\/api\/v1\/[^']*)'/g)) found.add(match[1] ?? '');
    for (const match of source.matchAll(/apiDelete\(\s*`(\/api\/v1\/[^`]*)`/g)) found.add(headOf(match[1] ?? ''));
  }
  return [...found];
}

function ownedGetsOutsideApi(): readonly string[] {
  return walk(fileURLToPath(new URL('../../apps/web/src', import.meta.url))).filter((file) => {
    if (file.includes('/shared/api/')) return false;
    const source = readFileSync(file, 'utf8');
    return /apiGet(?:WithSignal)?\(/.test(source) && /\/api\/v1\/(?:me\b|today\b|lines\b|plan\/)/.test(source);
  });
}

function headOf(path: string): string {
  const marker = path.indexOf('${');
  return marker === -1 ? path : path.slice(0, marker);
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) files.push(full);
  }
  return files;
}

function emptyToday() {
  return {
    asOf: '2026-11-03',
    arrivalMemos: [],
    counts: {
      overdue: 0,
      demand_before_confirmed: 0,
      due_today: 0,
      missing_date: 0,
      shipped_not_received: 0,
      unshipped: 0,
      fulfillment_review: 0,
      follow_up_due: 0,
      follow_up_scheduled: 0,
      note_missing: 0,
      upcoming: 0,
      exception_open: 0,
      review_pending: 0,
      import_pending: 0,
      unassigned: 0,
    },
    items: [],
    truncated: false,
  };
}
