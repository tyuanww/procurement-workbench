import { createRequire } from 'node:module';
import { NAV_ROUTES } from '../../apps/web/src/app/page-manifest.js';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import type { Role } from '../../packages/domain/src/index.js';
import { Shell } from '../../apps/web/src/app/Shell.js';
import { ShellSider, ShellTop } from '../../apps/web/src/app/shell-frame.js';
import { shellView, type NavRow, type ShellView } from '../../apps/web/src/features/shell/index.js';
import { initialFrame, shellChrome, type ShellChrome } from '../../apps/web/src/features/shell/model/chrome.js';
import { shellQuery, useShellViewport } from '../../apps/web/src/features/shell/use-viewport.js';
import { LineDetailPage } from '../../apps/web/src/pages/lines/detail/LineDetailPage.js';
import { LineListPage } from '../../apps/web/src/pages/lines/list/LineListPage.js';
import { LoginPage } from '../../apps/web/src/pages/login/LoginPage.js';
import { ProgressPage } from '../../apps/web/src/pages/progress/ProgressPage.js';
import { ReportPrintPage } from '../../apps/web/src/pages/reports/ReportPages.js';
import { TodayPage } from '../../apps/web/src/pages/today/TodayPage.js';
import { onBrand } from '../../apps/web/src/theme/tokens.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const react = requireWeb('react');
const server = requireWeb('react-dom/server');
const router = requireWeb('react-router');
const rows: readonly NavRow[] = [
  { to: '/progress', label: '管理店铺', matchPaths: ['/progress'], badge: { kind: 'none' } },
  { to: '/lines', label: '跟进中心', matchPaths: ['/lines'], badge: { kind: 'count', value: 7 } },
];

describe('视口探针', () => {
  it('1279 且 768 是收起的平板侧栏', () => {
    installMedia([shellQuery.max1279, shellQuery.atLeast768]);
    expect(textOf(h(ViewportProbe, null))).toBe('tablet 16 sider collapsed');
  });

  it('两条查询都不中是抽屉', () => {
    installMedia([]);
    expect(textOf(h(ViewportProbe, null))).toBe('phone 16 drawer closed');
  });

  it('1440 宽屏默认展开', () => {
    installMedia([shellQuery.min1440, shellQuery.atLeast768]);
    expect(textOf(h(ViewportProbe, null))).toBe('wide 24 sider expanded');
  });
});

describe('壳标记', () => {
  it('1279 的壳让侧栏和分组菜单同时收起', () => {
    installMedia([shellQuery.max1279, shellQuery.atLeast768]);
    const html = inRouter(h(Shell, { view: buyerView() }));
    expect(html).toContain('ant-layout-sider-collapsed');
    expect(html).toContain('ant-menu-inline-collapsed');
  });

  it('收起的侧栏保留图标并隐藏计数角标', () => {
    const html = inRouter(h(ShellSider, { chrome: sider(true), nav: rows, onToggle: () => undefined }));
    expect(anchor(html, '/progress')).toContain('aria-label="管理店铺"');
    expect(anchor(html, '/lines')).toContain('aria-label="跟进中心"');
    expect(html).toContain('data-icon="field-time"');
    expect(html).toContain('data-icon="profile"');
    expect(anchor(html, '/lines')).not.toContain('>7<');
    expect(anchor(html, '/lines')).not.toContain('ant-badge');
    expect(html).toContain(onBrand.solid);
    expect(html).not.toContain('«');
    expect(html).not.toContain('»');
    expect(html).not.toContain('#fff');
    expect(html).toContain('ant-menu-inline-collapsed');
    for (const row of rows) expect(html).toContain(`href="${row.to}"`);
  });

  it('展开的侧栏在链接里写出名称', () => {
    const html = inRouter(h(ShellSider, { chrome: sider(false), nav: rows, onToggle: () => undefined }));
    expect(anchor(html, '/lines')).toContain('跟进中心');
    expect(anchor(html, '/progress')).toContain('管理店铺');
  });

  it.each([
    { pathname: '/today', label: '行动板', href: '/today' },
    { pathname: '/today?view=arrivals&group=owner', label: '在途待收', href: '/today?view=arrivals' },
    { pathname: '/today?group=supplier', label: '今日排期', href: '/today?group=schedule' },
    { pathname: '/today?view=schedule', label: '今日排期', href: '/today?group=schedule' },
    { pathname: '/progress', label: '订单与任务排期', href: '/progress/schedule' },
    { pathname: '/progress?view=development', label: '新品开发', href: '/progress/development' },
    { pathname: '/progress/current?store=dafuyan&scope=mine', label: '当前进度', href: '/progress/current?store=dafuyan&amp;scope=mine' },
    { pathname: '/progress/schedule?planScope=development', label: '新品开发', href: '/progress/development' },
    { pathname: '/progress/development?planScope=all', label: '订单与任务排期', href: '/progress/schedule' },
  ])('侧栏为 $pathname 展开分组并标记当前页签 $label', ({ pathname, label, href }) => {
    const html = atPath({ pathname, pattern: '*', element: h(ShellSider, { chrome: sider(false), nav: buyerView().nav, onToggle: () => undefined }) });
    const current = anchor(html, href);
    expect(current).toContain(`aria-label="${label}"`);
    expect(current).toContain('aria-current="page"');
  });

  it('侧栏从订单排期进入新品时保留店铺，采用新品默认周期', () => {
    const pathname = '/progress/schedule?store=dafuyan&scale=day&from=2026-11-27&planDisplay=list&scheduleLine=synthetic-order';
    const html = atPath({ pathname, pattern: '*', element: h(ShellSider, { chrome: sider(false), nav: buyerView().nav, onToggle: () => undefined }) });
    const development = anchor(html, '/progress/development?store=dafuyan');
    expect(development).toContain('aria-label="新品开发"');
    expect(development).not.toContain('aria-current');
    expect(development).not.toContain('scheduleLine');
  });

  it.each([
    { roles: ['buyer'] satisfies Role[], count: 7, shown: '7', range: '本人' },
    { roles: ['admin'] satisfies Role[], count: 12, shown: '12', range: '全范围' },
    { roles: ['buyer', 'lead'] satisfies Role[], count: 123, shown: '123', range: '全范围' },
    { roles: ['manager'] satisfies Role[], count: 1000, shown: '999+', range: '全范围' },
  ])('今日事项展开时显示 $shown，收起时仍保留 $range 计数说明', ({ roles, count, shown, range }) => {
    const nav = shellView({
      user: { name: '测试用户', roles },
      queue: { kind: 'unknown' },
      today: { kind: 'complete', severities: Array.from({ length: count }, () => 2) },
      procurementDate: null,
      navRoutes: NAV_ROUTES,
    }).nav;
    const render = (isCollapsed: boolean) => inRouter(h(ShellSider, { chrome: sider(isCollapsed), nav, onToggle: () => undefined }));
    const expanded = render(false);
    const collapsed = render(true);
    const badge = expanded.match(/<sup[^>]+class="[^"]*ant-badge-count[^>]*>(.*?)<\/sup>/)?.[1];
    expect(badge?.replace(/<[^>]+>/g, '')).toBe(shown);
    expect(expanded).toContain(`>${range}需关注</span>`);
    for (const html of [expanded, collapsed]) {
      expect(html).toContain(`hidden="">${range}需关注 ${count} 项</span>`);
      expect(html).toContain('>今日事项<');
    }
    expect(collapsed).not.toContain('ant-badge-count');
  });

  it.each([
    { platform: 'MacIntel', shortcut: '⌘K', ariaKeys: 'Meta+K' },
    { platform: 'Win32', shortcut: 'Ctrl+K', ariaKeys: 'Control+K' },
  ])('顶栏吸顶，搜索按钮显示并声明 $platform 的快捷键', ({ platform, shortcut, ariaKeys }) => {
    vi.stubGlobal('navigator', { platform });
    onTestFinished(() => { vi.unstubAllGlobals(); });
    const html = inRouter(h(ShellTop, {
      account: { entries: [] },
      onSearch: () => undefined,
      contentInset: 24,
      menuButton: null,
      startContent: '今日事项 / 个人工作台',
    }));
    expect(html).toMatch(/z-index:10(?!\d)/);
    expect(html).toContain('position:sticky');
    expect(html).toMatch(/top:0(?!\d)/);
    expect(html).toContain('今日事项 / 个人工作台');
    expect(html).not.toContain('开发登录');
    const searchButton = html.match(/<button\b[^>]*aria-label="搜索单号、品名、供应商"[^>]*>.*?<\/button>/)?.[0];
    expect(searchButton).toContain(`aria-keyshortcuts="${ariaKeys}"`);
    expect(searchButton?.match(/<span aria-hidden="true"[^>]*>([^<]*)<\/span>/)?.[1]).toBe(shortcut);
    expect(html).not.toContain('搜索 单号 / 品名 / 编码');
  });

  it('内容区自成层叠上下文，表头再 sticky 也盖不住顶栏', () => {
    installMedia([shellQuery.min1440, shellQuery.atLeast768]);
    const html = inRouter(h(Shell, { view: buyerView() }));
    expect(html).toContain('isolation:isolate');
  });

  it('手机只给 44 的菜单按钮，没有常驻侧栏，也不挤产品名', () => {
    installMedia([]);
    const html = inRouter(h(Shell, { view: buyerView() }));
    expect(html).toContain('aria-label="打开菜单"');
    expect(html).toContain('44px');
    expect(html).toContain('grid-template-columns:auto minmax(0, 1fr) auto');
    expect(html).not.toContain('SHINEMAGE 供应链工作台');
    expect(html).not.toContain('ant-layout-sider');
  });
});

describe('页标题', () => {
  it('当前进度保留唯一的语义标题，标题行不占版面', () => {
    const html = inRouter(h(ProgressPage, { view: 'current' }));
    expect(headingCount(html)).toBe(1);
    expect(html).toContain('shell-page');
    expect(html).toMatch(/<h1[^>]*clip-path:inset\(50%\)[^>]*>当前进度<\/h1>/);
  });

  it('登录保留一级标题，不进壳页面', () => {
    const html = inRouter(h(LoginPage, null));
    expect(headingCount(html)).toBe(1);
    expect(html).not.toContain('shell-page');
  });

  it('今日和打印页有标题，不进壳页面', () => {
    const today = inRouter(h(TodayPage, null));
    const printed = inRouter(h(ReportPrintPage, null));
    expect(headingCount(today)).toBe(1);
    expect(today).toContain('>个人工作台<');
    expect(today).not.toContain('shell-page');
    expect(headingCount(printed)).toBe(1);
    expect(printed).toContain('>周报<');
    expect(printed).not.toContain('shell-page');
  });

  it('手机顶栏只留菜单、搜索和账号，不塞新鲜度和产品名', () => {
    const html = inRouter(h(ShellTop, {
      account: { entries: [] },
      onSearch: () => undefined,
      contentInset: 16,
      startContent: null,
      menuButton: { toggleName: '打开菜单', hitPx: 44, isOpen: false, onToggle: () => undefined },
    }));
    expect(html).toContain('aria-label="打开菜单"');
    expect(html).not.toContain('采购订单总表');
    expect(html).not.toContain('开发登录');
    expect(html).not.toContain('SHINEMAGE 供应链工作台');
    expect(html).toContain('grid-template-columns:auto minmax(0, 1fr) auto');
  });

  it('订单行详情加载时只有一个中性标题，不写路由 id', () => {
    const html = atPath({ pathname: '/lines/internal-id', pattern: '/lines/:id', element: h(LineDetailPage, null) });
    expect(html).not.toContain('internal-id');
    expect(headingCount(html)).toBe(1);
    expect(html).toContain('>订单行<');
  });

  it('跟进中心首次进入是骨架，不再锁 480 高', () => {
    const html = inRouter(h(LineListPage, null));
    expect(html).not.toContain('max-height:480');
    expect(html).toContain('ant-skeleton');
  });
});

function ViewportProbe() {
  const viewport = useShellViewport();
  const chrome = shellChrome(initialFrame(viewport));
  const fold = chrome.kind === 'sider' ? (chrome.isCollapsed ? 'collapsed' : 'expanded') : 'closed';
  return h('span', { children: `${viewport.band} ${viewport.contentInset} ${chrome.kind} ${fold}` });
}

function buyerView(): ShellView {
  return shellView({
    user: { name: '用户', roles: ['buyer'] },
    queue: { kind: 'unknown' },
    today: { kind: 'pending' },
    procurementDate: null,
    navRoutes: NAV_ROUTES,
  });
}

function sider(isCollapsed: boolean): Extract<ShellChrome, { readonly kind: 'sider' }> {
  const frame = isCollapsed ? initialFrame({ band: 'tablet', contentInset: 16, isNarrow: false }) : initialFrame({ band: 'wide', contentInset: 24, isNarrow: false });
  const chrome = shellChrome(frame);
  if (chrome.kind !== 'sider') throw new Error('不是侧栏');
  return chrome;
}

function installMedia(queries: readonly string[]): void {
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    writable: true,
    value(query: string) {
      return {
        matches: queries.includes(query),
        addEventListener() {
          return undefined;
        },
        removeEventListener() {
          return undefined;
        },
      };
    },
  });
}

function inRouter(node: unknown): string {
  if (!isRouter(router)) throw new Error('web 渲染模块不齐');
  return markup(h(router.MemoryRouter, { children: node }));
}

function atPath(input: { readonly pathname: string; readonly pattern: string; readonly element: unknown }): string {
  if (!isRouter(router)) throw new Error('web 渲染模块不齐');
  const route = h(router.Route, { path: input.pattern, element: input.element });
  const routes = h(router.Routes, { children: route });
  return markup(h(router.MemoryRouter, { initialEntries: [input.pathname], children: routes }));
}

function h(type: unknown, props: unknown): unknown {
  if (!isCreator(react)) throw new Error('web 渲染模块不齐');
  return react.createElement(type, props);
}

function markup(node: unknown): string {
  if (!isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(node);
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function textOf(node: unknown): string {
  return markup(node).replace(/<[^>]+>/g, '');
}

function headingCount(html: string): number {
  return html.split('<h1').length - 1;
}

function anchor(html: string, href: string): string {
  const at = html.indexOf(`href="${href}"`);
  if (at < 0) throw new Error(`没有链接 ${href}`);
  const open = html.lastIndexOf('<a', at);
  const close = html.indexOf('</a>', at);
  if (open < 0 || close < 0) throw new Error(`链接不完整 ${href}`);
  return html.slice(open, close);
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRouter(value: unknown): value is { MemoryRouter: unknown; Routes: unknown; Route: unknown } {
  return isRecord(value) && 'MemoryRouter' in value && 'Routes' in value && 'Route' in value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
