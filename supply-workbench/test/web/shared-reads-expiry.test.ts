import { expect, it, vi } from 'vitest';
import { emptyReads, listenToday, read } from '../../apps/web/src/shared/api/reads.js';
import { clearFamily, RETAIN_MS } from '../../apps/web/src/shared/api/slots.js';

it('一个今日范围的新数据不会延长另一个范围的保留', async () => {
  vi.useFakeTimers();
  emptyReads();
  const seen: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    seen.push(urlOf(input));
    return json(todayOf(urlOf(input).includes('scope=all') ? 11 : 1));
  };
  try {
    await read({ name: 'today', scope: 'mine' });
    await vi.advanceTimersByTimeAsync(20_000);
    await read({ name: 'today', scope: 'all' });
    await vi.advanceTimersByTimeAsync(RETAIN_MS - 15_000);
    await read({ name: 'today', scope: 'mine' });
    await read({ name: 'today', scope: 'all' });
    expect(seen).toEqual([
      '/api/v1/today?scope=mine',
      '/api/v1/today?scope=all',
      '/api/v1/today?scope=mine',
    ]);
  } finally {
    globalThis.fetch = previous;
    emptyReads();
    vi.useRealTimers();
  }
});

it('mine 到期不会把在飞的 scope=all 再请求一次', async () => {
  vi.useFakeTimers();
  emptyReads();
  let allCalls = 0;
  let releaseAll: ((response: Response) => void) | undefined;
  const previous = globalThis.fetch;
  globalThis.fetch = (input) => {
    if (!urlOf(input).includes('scope=all')) return Promise.resolve(json(todayOf(1)));
    allCalls += 1;
    if (allCalls === 1) return new Promise((resolve) => { releaseAll = resolve; });
    return Promise.resolve(json(todayOf(9)));
  };
  try {
    const pending = read({ name: 'today', scope: 'all' });
    await read({ name: 'today', scope: 'mine' });
    await vi.advanceTimersByTimeAsync(RETAIN_MS);
    releaseAll?.(json(todayOf(4)));
    await expect(pending).resolves.toMatchObject({ counts: { overdue: 4 } });
    expect(allCalls).toBe(1);
  } finally {
    globalThis.fetch = previous;
    emptyReads();
    vi.useRealTimers();
  }
});

it('今日被清掉之后，更早的失败不会盖住重读', async () => {
  vi.useFakeTimers();
  emptyReads();
  const views: string[] = [];
  let failAll: ((response: Response) => void) | undefined;
  let allCalls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = (input) => {
    if (!urlOf(input).includes('scope=all')) return Promise.resolve(json(todayOf(1)));
    allCalls += 1;
    if (allCalls === 1) return new Promise((resolve) => { failAll = resolve; });
    return Promise.resolve(json(todayOf(0)));
  };
  try {
    const stop = listenToday({ scope: 'all', onChange: (view) => { views.push(view.status); } });
    clearFamily('today', { isSilent: false });
    await vi.advanceTimersByTimeAsync(0);
    failAll?.(denied());
    await vi.advanceTimersByTimeAsync(0);
    expect(views.at(-1)).toBe('ready');
    expect(views).not.toContain('error');
    stop();
  } finally {
    globalThis.fetch = previous;
    emptyReads();
    vi.useRealTimers();
  }
});

function denied(): Response {
  return new Response(JSON.stringify({ error: { code: 'UNAUTHENTICATED', message: '服务器原文', details: null } }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function todayOf(overdue: number): unknown {
  return {
    asOf: '2026-11-11',
    counts: {
      overdue,
      demand_before_confirmed: 0,
      due_today: 0,
      missing_date: 0,
      shipped_not_received: 0,
      unshipped: 0,
      fulfillment_review: 0,
      note_missing: 0,
      upcoming: 0,
      exception_open: 0,
      review_pending: 0,
      import_pending: 0,
      unassigned: 0,
    },
    items: [],
    arrivalMemos: [],
    truncated: false,
  };
}
