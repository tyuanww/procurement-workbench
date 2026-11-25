import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { todayMotionCss } from '../../apps/web/src/features/today/today-style.js';
import { MissingValue, StatusTag } from '../../apps/web/src/shared/ui/widgets.js';
import { TodayScreen } from '../../apps/web/src/pages/today/TodayBoard.js';
import { DashboardPage } from '../../apps/web/src/pages/dashboard/DashboardPage.js';
import { LineListPage } from '../../apps/web/src/pages/lines/list/LineListPage.js';
import { ProgressPage } from '../../apps/web/src/pages/progress/ProgressPage.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

describe('加载、错误和空态', () => {
  it('今日没读完是骨架，不是白屏', () => {
    const html = render(TodayScreen, todayProps({ isReady: false }));
    expect(html).toContain('ant-skeleton');
    expect(html).toContain('个人工作台');
  });

  it('今日读失败是 Result，带错误、重试和返回', () => {
    const html = render(TodayScreen, todayProps({ isReady: true, loadError: '网络断了' }));
    expect(html).toContain('ant-result');
    expect(html).toContain('个人工作台没有读出来');
    expect(html).toContain('网络断了');
    const text = html.replace(/\s+/g, '');
    expect(text).toContain('重试');
    expect(text).toContain('返回');
  });

  it('今日空态有一句说明和去跟进中心按钮', () => {
    const html = render(TodayScreen, todayProps());
    expect(html).toContain('ant-empty');
    expect(html).toContain('去跟进中心');
    expect(html).toContain('href="/lines"');
  });

  it('跟进中心、看板、进度首次进入是骨架', () => {
    expect(inRouter(LineListPage)).toContain('ant-skeleton');
    expect(inRouter(DashboardPage)).toContain('ant-skeleton');
    expect(inRouter(ProgressPage)).toContain('ant-skeleton');
  });
});

describe('动效', () => {
  it('今日淡出 180 毫秒，减少动态效果时关掉', () => {
    const css = todayMotionCss();
    expect(css).toContain('opacity 180ms');
    expect(css).toContain('prefers-reduced-motion: reduce');
    expect(css).toMatch(/transition:\s*none/);
  });
});

describe('缺值和状态', () => {
  it('缺值有原因、可键盘聚焦，颜色走主题补丁', () => {
    const html = render(MissingValue, { reason: 'not_provided' });
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="缺值：未填写"');
    expect(html).toContain('missing-value');
  });

  it('实心 Tag 用浅边，描边 Tag 底透明', () => {
    const solid = render(StatusTag, { status: 'overdue' });
    expect(solid).toContain('border-color:#ECBFBC');
    expect(solid).toContain('background:#FEF3F2');
    const outline = render(StatusTag, { status: 'confirmed' });
    expect(outline).toContain('background:transparent');
    expect(outline).toContain('border-color:#1849A9');
  });

  it('状态 Tag 用领域词表文案，取消带删除线', () => {
    expect(render(StatusTag, { status: 'overdue' })).toContain('逾期未到');
    expect(render(StatusTag, { status: 'done' })).toContain('已完成（工作台）');
    expect(render(StatusTag, { status: 'cancelled' })).toContain('line-through');
  });
});

function todayProps(override: Record<string, unknown> = {}): Record<string, unknown> {
  const noop = () => undefined;
  return {
    board: { group: 'waiting', chips: [], body: { kind: 'empty', text: '今天没有待办。下一步：去跟进中心看看。' } },
    focus: null,
    fading: null,
    drawerId: null,
    draft: null,
    hadDate: false,
    lane: 'finished',
    isSaving: false,
    notice: '',
    isHelpOpen: false,
    isReady: true,
    loadError: '',
    onToggleReason: noop,
    onGroup: noop,
    onOpen: noop,
    onQuick: noop,
    onCopy: noop,
    onCloseDrawer: noop,
    onDraft: noop,
    onSubmit: noop,
    onRetry: noop,
    onBack: noop,
    ...override,
  };
}

function inRouter(type: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  const router = requireWeb('react-router');
  if (!isCreator(react) || !isRenderer(server) || !isRouter(router)) throw new Error('web 渲染模块不齐');
  return renderTo(server, react.createElement(router.MemoryRouter, { children: react.createElement(type, null) }));
}

function render(type: unknown, props: unknown): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  return renderTo(server, react.createElement(type, props));
}

function renderTo(server: { renderToStaticMarkup: (node: unknown) => unknown }, node: unknown): string {
  const html = server.renderToStaticMarkup(node);
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
