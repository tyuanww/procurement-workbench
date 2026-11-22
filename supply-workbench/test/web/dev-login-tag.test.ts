import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { ShellTop } from '../../apps/web/src/app/shell-frame.js';
import { brand } from '../../apps/web/src/theme/tokens.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

it('开发登录标签只在登录模式打开时出现', () => {
  const hidden = markup(false);
  const shown = markup(true);
  expect(hidden.includes('开发登录')).toBe(false);
  expect(shown.includes('开发登录')).toBe(true);
  const tag = devTag(shown);
  expect(tag.includes('开发登录')).toBe(true);
  expect(tag.includes(brand[600])).toBe(false);
  expect(tag.includes(`color="${brand[600]}"`)).toBe(false);
});

function markup(devLogin: boolean): string {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  const router = requireWeb('react-router');
  if (!isCreator(react) || !isRenderer(server) || !isRouter(router)) throw new Error('web 渲染模块不齐');
  const top = react.createElement(ShellTop, {
    devLogin,
    freshness: { headline: '数据', chips: [] },
    account: { entries: [] },
    onSearch: () => undefined,
    contentInset: 16,
    menuButton: null,
  });
  const html = server.renderToStaticMarkup(react.createElement(router.MemoryRouter, { children: top }));
  if (typeof html !== 'string') throw new Error('没有渲染成字符串');
  return html;
}

function devTag(html: string): string {
  const at = html.indexOf('开发登录');
  const open = html.lastIndexOf('<', at);
  return html.slice(open, at + '开发登录'.length);
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
