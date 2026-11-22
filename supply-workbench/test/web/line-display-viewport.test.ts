// @vitest-environment happy-dom
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, it } from 'vitest';
import { readDesk } from '../../apps/web/src/features/follow-up/index.js';
import { lineTableLayout, renderedLineColumns } from '../../apps/web/src/features/follow-up/line-list/rendered-columns.js';
import { presetViews } from '../../apps/web/src/features/follow-up/index.js';
import { LineViewBar } from '../../apps/web/src/pages/lines/list/view-bar.js';
import { shellQuery } from '../../apps/web/src/features/shell/use-viewport.js';

const requireWeb = createRequire(path.join(process.cwd(), 'apps/web/package.json'));
const COLUMNS = readDesk('lane=finished').columns;

it('340 和 341 用显示菜单，390 和 767 仍是手机，768 用列和导出', () => {
  expect(compact(renderAt(340))).toContain('显示');
  expect(compact(renderAt(340))).not.toContain('>列<');
  expect(compact(renderAt(341))).toContain('显示');
  expect(compact(renderAt(390))).toContain('显示');
  expect(compact(renderAt(767))).toContain('显示');
  const desk = renderAt(768);
  expect(compact(desk)).toContain('导出Excel');
  expect(desk).toContain('>列<');
  expect(compact(desk)).not.toContain('显示');
});

it('340 导出列去掉下一到货，341 保留，768 用桌面列序', () => {
  expect(keysAt(340)).toEqual(['po', 'name', 'stage', 'daysInStage']);
  expect(keysAt(341)).toEqual(['po', 'name', 'stage', 'nextDue', 'daysInStage']);
  expect(keysAt(390)).toEqual(['po', 'name', 'stage', 'nextDue', 'daysInStage']);
  expect(keysAt(767)).toEqual(['po', 'name', 'stage', 'nextDue', 'daysInStage']);
  expect(keysAt(768)).toEqual(COLUMNS.map((column) => column.key));
});

function keysAt(width: number): readonly string[] {
  const layout = lineTableLayout({ band: width >= 768 ? 'tablet' : 'phone', isNarrow: width <= 340 });
  return renderedLineColumns({ columns: COLUMNS, hiddenKeys: [], layout }).map((column) => column.key);
}

function renderAt(width: number): string {
  installMedia(width);
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  if (!isCreator(react) || !isRenderer(server)) throw new Error('web 渲染模块不齐');
  const html = server.renderToStaticMarkup(react.createElement(LineViewBar, viewProps()));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function viewProps(): Record<string, unknown> {
  const noop = () => undefined;
  return {
    search: '',
    query: 'lane=finished',
    views: presetViews(),
    userId: 'buyer-1',
    columns: COLUMNS,
    density: 'small',
    hiddenKeys: [],
    setMessage: noop,
    setParams: noop,
  };
}

function installMedia(width: number): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: matches(query, width),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

function matches(query: string, width: number): boolean {
  if (query === shellQuery.max340) return width <= 340;
  if (query === shellQuery.max1279) return width <= 1279;
  if (query === shellQuery.atLeast768) return width >= 768;
  if (query === shellQuery.min1440) return width >= 1440;
  return false;
}

function compact(html: string): string {
  return html.replace(/\s/g, '');
}

function isCreator(value: unknown): value is { createElement: (type: unknown, props: unknown) => unknown } {
  return isRecord(value) && typeof value.createElement === 'function';
}

function isRenderer(value: unknown): value is { renderToStaticMarkup: (node: unknown) => unknown } {
  return isRecord(value) && typeof value.renderToStaticMarkup === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
