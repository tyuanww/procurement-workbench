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
  { path: '/reports', title: '周报', label: '周报（待开发）' },
  { path: '/reports/', title: '周报', label: '周报（待开发）' },
  { path: '/reports/r1', title: '周报详情', label: '周报（待开发）' },
])('$path 用面包屑标出当前管理视图', ({ path, title, label }) => {
  const html = render(path, ['lead']);
  expect(html).toContain(`>${title}</h1>`);
  expect(html).not.toContain('这个角色看不到这页。');
  const breadcrumb = html.match(/<nav[^>]*aria-label="当前位置"[^>]*>.*?<\/nav>/)?.[0];
  expect(breadcrumb).toContain('管理看板');
  expect(breadcrumb).toContain(`>${label}<`);
  expect(html).not.toContain('aria-label="管理视图"');
});

it.each([
  ['/home', ['首页']],
  ['/today?view=arrivals', ['今日事项', '在途待收']],
  ['/today?group=owner', ['今日事项', '今日排期']],
  ['/progress/current?store=dafuyan', ['计划与新品', '当前进度']],
  ['/progress/schedule?lens=risk&preset=custom&from=2026-11-16&to=2026-11-22', ['管理看板', '排期任务进度']],
  ['/progress?view=schedule', ['计划与新品', '订单与任务排期']],
  ['/progress/development?planScope=unknown', ['计划与新品', '新品开发']],
  ['/progress?view=development&lens=risk', ['计划与新品', '新品开发']],
  ['/lines', ['跟进中心']],
  ['/lines/id', ['跟进中心', '订单行详情']],
  ['/products', ['产品档案']],
  ['/products/id?card=stock', ['产品档案', '产品详情', '库存']],
  ['/imports/id', ['导入与审核', '导入中心', '导入批次']],
  ['/master?tab=unlinked&scope=active', ['导入与审核', '当前关联诊断']],
  ['/reports/id', ['管理看板', '周报（待开发）', '周报详情']],
  ['/parties/id', ['主体详情']],
  ['/settings?entity=orders', ['系统设置', '审计']],
  ['/settings?entity=orders&section=settings', ['系统设置', '阈值']],
] satisfies [string, string[]][])('%s 的桌面顶栏只显示一条完整路径', (path, labels) => {
  const html = render(path, ['admin']);
  expect(html.match(/aria-label="当前位置"/g)).toHaveLength(1);
  expect(html.match(/<header\b[^>]*\bshell-header\b[^>]*>/g)).toHaveLength(1);
  const header = html.match(/<header\b[^>]*>(.*?)<\/header>/s)?.[1] ?? '';
  const nav = header.match(/<nav[^>]*aria-label="当前位置"[^>]*>(.*?)<\/nav>/s)?.[1] ?? '';
  const trail = [...nav.matchAll(/<li[^>]+class="ant-breadcrumb-item"[^>]*>(.*?)<\/li>/gs)].map((match) => match[1]?.replace(/<[^>]+>/g, ''));
  expect(trail).toEqual(labels);
  expect(nav).toContain(`aria-current="page">${labels.at(-1)}<`);
});

it.each(['/master?tab=owner-map', '/settings', '/reports/id', '/lines/id/unknown', '/progress/schedule?lens=risk', '/progress?view=schedule&lens=risk', '/progress?lens=risk',
  '/progress?view=unknown&lens=risk', '/progress?view=&lens=risk', '/progress/schedule//?lens=risk', '/progress///?view=schedule&lens=risk'])('无权或不存在的页面 %s 不显示业务路径', (path) => {
  expect(render(path, ['buyer'])).not.toContain('aria-label="当前位置"');
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
