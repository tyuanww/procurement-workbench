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

it('管理层进不了设置，负责人仍能看周报', () => {
  const settings = render('/settings', ['manager']);
  expect(settings).toContain('这个角色看不到这页。');
  expect(settings).not.toContain('name="roles"');
  const reports = render('/reports', ['lead']);
  expect(reports.replace(/\s+/g, '')).toContain('生成');
  expect(reports).not.toContain('这个角色看不到这页。');
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
