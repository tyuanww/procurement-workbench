import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { entityId, type Role } from '../../packages/domain/src/index.js';
import { AppRoutes } from '../../apps/web/src/app/routes.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

it('采购打开看板是 403，页面请求没有发出', () => {
  const calls: string[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    return new Response('{}', { status: 500 });
  };
  try {
    const html = render('/dashboard', ['buyer']);
    expect(html).toContain('这个角色看不到这页。');
    expect(html).not.toContain('管理看板');
    expect(calls.some((url) => url.includes('/api/v1/dashboard'))).toBe(false);
  } finally {
    globalThis.fetch = previous;
  }
});

it.each(['/reports', '/reports/r1', '/reports/r1/print', '/REPORTS/r1/print'])('采购和审核人直接打开 %s 时被拒', (path) => {
  for (const role of ['buyer', 'reviewer'] satisfies Role[]) {
    const html = render(path, [role]);
    expect(html).toContain('这个角色看不到这页。');
    expect(html).not.toContain('aria-label="管理视图"');
    expect(html).not.toContain('class="report-print"');
  }
});

it.each([
  { path: '/dashboard', title: '卡点', label: '卡点' },
  { path: '/dashboard/', title: '卡点', label: '卡点' },
  { path: '/dashboard?view=suppliers', title: '供应商表现', label: '供应商表现' },
  { path: '/reports', title: '周报', label: '周报' },
  { path: '/reports/', title: '周报', label: '周报' },
  { path: '/reports/r1', title: '周报详情', label: '周报' },
])('$path 用面包屑标出当前管理视图', ({ path, title, label }) => {
  const html = render(path, ['lead']);
  expect(html).toContain(`>${title}</h1>`);
  expect(html).not.toContain('这个角色看不到这页。');
  const breadcrumb = html.match(/<nav[^>]*aria-label="当前位置"[^>]*>.*?<\/nav>/)?.[0];
  expect(breadcrumb).toContain('管理看板');
  expect(breadcrumb).toContain(`>${label}<`);
  expect(html).not.toContain('aria-label="管理视图"');
});

it('负责人可查看和打印周报，管理层可生成周报但无设置权限', () => {
  expect(render('/settings', ['manager'])).toContain('这个角色看不到这页。');
  const leadList = render('/reports', ['lead']);
  expect(leadList).toContain('已生成周报');
  expect(leadList).not.toContain('id="report-week-start"');
  expect(render('/reports?weekStart=2026-10-19', ['manager'])).toMatch(/<input[^>]*id="report-week-start"[^>]*value="2026-10-19"/);
  const printed = render('/reports/r1/print', ['lead']);
  expect(printed).toContain('class="report-print"');
  expect(printed).not.toContain('aria-label="管理视图"');
  expect(printed).not.toContain('aria-label="管理看板"');
});

function render(pathname: string, roles: readonly Role[]): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  const router = requireWeb('react-router');
  if (!isCreator(react) || !isRenderer(server) || !isRouter(router)) throw new Error('web 渲染模块不齐');
  const page = react.createElement(AppRoutes, {
    user: { id: entityId('user-1'), name: '用户', roles },
  });
  const html = server.renderToStaticMarkup(react.createElement(router.MemoryRouter, { initialEntries: [pathname], children: page }));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRouter(value: unknown): value is { MemoryRouter: unknown } {
  return isRecord(value) && 'MemoryRouter' in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
