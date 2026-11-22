import { NAV_ROUTES } from '../../apps/web/src/app/page-manifest.js';
import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import type { PartyAliasView } from '../../packages/application/src/master-data/views.js';
import { shellView, useRefreshReviewQueue, type QueueFacts } from '../../apps/web/src/features/shell/index.js';
import { commitQueue, createQueueRace } from '../../apps/web/src/features/shell/use-shell.js';
import { approveAlias } from '../../apps/web/src/pages/master/MasterPage.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const NOW = '2026-10-18T00:00:00.000Z';
const ONES = { aliases: 1, codes: 0, links: 0, multiName: 0 };
const ZEROS = { aliases: 0, codes: 0, links: 0, multiName: 0 };

it('审核通过后角标等于下一次计数，失败不再请求', async () => {
  expect(masterBadge(['reviewer'], { kind: 'known', ...ONES })).toEqual({ kind: 'count', value: 1 });
  const passed = await runApprove(false);
  expect(passed.queue).toEqual({ kind: 'known', ...ZEROS });
  expect(masterBadge(['reviewer'], passed.queue)).toEqual({ kind: 'none' });
  expect(passed.urls.some((url) => url.includes('/api/v1/auth'))).toBe(false);
  expect(passed.urls.filter((url) => url.includes('/review-queue/counts'))).toHaveLength(1);
  const failed = await runApprove(true);
  expect(failed.message).toContain('没有通过');
  expect(failed.urls.filter((url) => url.includes('/review-queue/counts'))).toHaveLength(0);
  expect(masterBadge(['admin'], { kind: 'known', ...ZEROS })).toEqual({ kind: 'none' });
});

it('后返回的旧计数不覆盖新计数', async () => {
  const race = createQueueRace();
  let release: (queue: QueueFacts) => void = () => undefined;
  const first = commitQueue({
    race,
    read: () => new Promise((resolve) => { release = resolve; }),
  });
  const second = commitQueue({
    race,
    read: async () => ({ kind: 'known', ...ZEROS }),
  });
  release({ kind: 'known', ...ONES });
  expect(await first).toBeNull();
  expect(await second).toEqual({ kind: 'known', ...ZEROS });
});

it('没有壳层时不能刷新审核队列', () => {
  expect(() => markup(Probe)).toThrow('审核队列只有壳层能刷新');
});

function Probe(): null {
  useRefreshReviewQueue();
  return null;
}

async function runApprove(isFailed: boolean): Promise<{ readonly urls: readonly string[]; readonly queue: QueueFacts; readonly message: string }> {
  const urls: string[] = [];
  const previous = globalThis.fetch;
  let queue: QueueFacts = { kind: 'known', ...ONES };
  let message = '';
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes('/approve')) {
      if (isFailed) return new Response(JSON.stringify({ error: { code: 'INTERNAL', message: '内部错误', details: {} } }), { status: 500 });
      return Response.json(approvedAlias());
    }
    if (url.includes('/review-queue/counts')) return Response.json(ZEROS);
    throw new Error(url);
  };
  try {
    const refresh = async () => {
      const response = await fetch('/api/v1/master/review-queue/counts');
      queue = knownCounts(await response.json());
    };
    await approveAlias({
      alias: pendingAlias(),
      partyId: '',
      roles: { isSupplier: true, isFactory: true },
      confirmed: false,
      refresh,
      onDone: () => undefined,
      setMessage: (value) => { message = value; },
    });
    return { urls, queue, message };
  } finally {
    globalThis.fetch = previous;
  }
}

function knownCounts(body: unknown): QueueFacts {
  if (!isRecord(body)) throw new Error('计数不对');
  return {
    kind: 'known',
    aliases: countField(body, 'aliases'),
    codes: countField(body, 'codes'),
    links: countField(body, 'links'),
    multiName: countField(body, 'multiName'),
  };
}

function countField(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (typeof value !== 'number') throw new Error('计数不对');
  return value;
}

function masterBadge(roles: readonly ['reviewer'] | readonly ['admin'], queue: QueueFacts) {
  const view = shellView({
    user: { name: '用户', roles },
    queue,
    today: { kind: 'pending' },
    freshness: { kind: 'pending' },
    now: NOW,
    navRoutes: NAV_ROUTES,
  });
  const row = view.nav.find((item) => item.to === '/master');
  if (row === undefined) throw new Error('没有主数据');
  return row.badge;
}

function pendingAlias(): PartyAliasView {
  return { ...approvedAlias(), status: 'pending', partyId: null, reviewedBy: null, reviewedAt: null };
}

function approvedAlias(): PartyAliasView {
  return {
    id: 'alias-1',
    rawName: '宜侬',
    normName: '宜侬',
    partyId: 'party-1',
    status: 'approved',
    firstSeenImportBatchId: null,
    seenCount: 1,
    reviewedBy: 'reviewer-1',
    reviewedAt: '2026-10-18T00:00:00.000Z',
    similar: [],
  };
}

function markup(type: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(type, null));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: null) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
