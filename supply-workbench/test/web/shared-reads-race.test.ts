import { expect, it } from 'vitest';
import { apiSend } from '../../apps/web/src/shared/api/client.js';
import { emptyReads, listenToday, read } from '../../apps/web/src/shared/api/reads.js';
import { loadToday } from '../../apps/web/src/pages/today/today-load.js';
import { pagedToday } from './today-page-fixture.js';

const ME = { id: 'buyer-1', name: '采购甲', roles: ['buyer'], devLogin: true };
const okSchema = {
  safeParse(value: unknown): { success: true; data: unknown } | { success: false } {
    return { success: true, data: value };
  },
};

it('别名通过后今日要重读', async () => {
  emptyReads();
  const seen: string[] = [];
  let todayCalls = 0;
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    seen.push(url);
    if (url.startsWith('/api/v1/today')) {
      todayCalls += 1;
      return json(pagedToday(todayBody(todayCalls === 1)));
    }
    if (url.includes('/api/v1/me')) return json(ME);
    return json({ ok: true });
  };
  try {
    const first = await loadToday();
    await apiSend({ path: '/api/v1/master/aliases/alias-1/approve', method: 'POST', body: {}, schema: okSchema });
    const second = await loadToday();
    expect(first.items.map((item) => item.id)).toEqual(['review']);
    expect(second.items.map((item) => item.id)).toEqual([]);
    expect(seen.filter((url) => url.startsWith('/api/v1/today'))).toEqual([
      '/api/v1/today?scope=mine&includePending=true&inbox=today&page=1&pageSize=50',
      '/api/v1/today?scope=mine&includePending=true&inbox=today&page=1&pageSize=50',
    ]);
  } finally {
    globalThis.fetch = previous;
    emptyReads();
  }
});

it('更早的在途今日不能盖住写入后的新正文', async () => {
  emptyReads();
  const pending: { resolve: (response: Response) => void }[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (input) => {
    const url = requestUrl(input);
    if (url.startsWith('/api/v1/today')) return new Promise((resolve) => { pending.push({ resolve }); });
    return Promise.resolve(json({ ok: true }));
  };
  const views: string[] = [];
  try {
    listenToday({
      scope: 'mine',
      onChange: (view) => {
        views.push(view.status === 'ready' ? `ready:${view.value.counts.overdue}` : view.status);
      },
    });
    await apiSend({ path: '/api/v1/follow-ups', method: 'POST', body: {}, schema: okSchema });
    const fresh = pending[1];
    const stale = pending[0];
    if (fresh === undefined || stale === undefined) throw new Error('两次今日飞行没有都发出');
    fresh.resolve(json(agedToday(0)));
    await flush();
    stale.resolve(json(agedToday(4)));
    await flush();
    const cached = await read({ name: 'today', scope: 'mine' });
    expect(views.at(-1)).toBe('ready:0');
    expect(cached.counts.overdue).toBe(0);
  } finally {
    globalThis.fetch = previous;
    emptyReads();
  }
});

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

type TodayFixture = {
  readonly asOf: string;
  readonly counts: Record<string, number>;
  readonly items: readonly unknown[];
  readonly arrivalMemos: readonly unknown[];
  readonly truncated: boolean;
};

function todayBody(withReview: boolean): TodayFixture {
  const base = agedToday(0);
  return {
    ...base,
    counts: { ...base.counts, review_pending: withReview ? 1 : 0 },
    items: withReview ? [reviewItem()] : [],
  };
}

function agedToday(overdue: number): TodayFixture {
  return {
    asOf: '2026-11-03',
    arrivalMemos: [],
    counts: { ...emptyCounts(), overdue },
    items: overdue === 0 ? [] : [urgentItem()],
    truncated: false,
  };
}

function emptyCounts(): Record<string, number> {
  return {
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
  };
}

function reviewItem(): unknown {
  return {
    id: 'review',
    subject: 'review',
    reasons: ['review_pending'],
    severity: 1,
    ownerUserId: null,
    waitingOn: { kind: 'internal', partyId: null },
    dueDate: null,
    overdueDays: null,
    refs: {},
    line: null,
    batch: null,
    waitingOnParty: null,
    exception: null,
  };
}

function urgentItem(): unknown {
  return {
    id: 'batch:b1',
    subject: 'batch',
    reasons: ['overdue'],
    severity: 3,
    ownerUserId: 'buyer-1',
    waitingOn: { kind: 'supplier', partyId: null },
    dueDate: '2026-11-01',
    overdueDays: 4,
    refs: { orderLineId: 'line-1', batchId: 'batch-1' },
    line: null,
    batch: null,
    waitingOnParty: null,
    exception: null,
  };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => { setTimeout(resolve, 0); });
}
