import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { roleOptions, selectedRoles } from '../../apps/web/src/features/platform/index.js';
import { SettingsPage } from '../../apps/web/src/pages/settings/SettingsPage.js';

const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));

it('选两个角色得到两个码，一个不选被拒', () => {
  expect(selectedRoles(['buyer', 'reviewer'])).toEqual({ ok: true, roles: ['buyer', 'reviewer'] });
  expect(selectedRoles([])).toEqual({ ok: false, message: '至少选一个角色' });
});

it('新建用户的角色是 antd 多选，选项是中文角色名，提交值是角色码', () => {
  const react = requireWeb('react');
  const server = requireWeb('react-dom/server');
  const router = requireWeb('react-router');
  if (!isCreator(react) || !isRenderer(server) || !isRouter(router)) throw new Error('web 渲染模块不齐');
  const page = react.createElement(SettingsPage, null);
  const html = server.renderToStaticMarkup(react.createElement(router.MemoryRouter, { children: page }));
  if (typeof html !== 'string') throw new Error('设置页没有渲染成字符串');
  expect(html).toContain('aria-label="角色"');
  expect(html).toContain('ant-select-multiple');
  expect(html).not.toContain('<select');
  expect(roleOptions().map((option) => `${option.code}:${option.text}`)).toEqual([
    'buyer:采购员',
    'reviewer:主数据审核人',
    'manager:管理层',
    'lead:供应链负责人',
    'admin:管理员',
  ]);
});

function isCreator(value: unknown): value is { createElement: (type: unknown, props: { readonly children: unknown } | null) => unknown } {
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
