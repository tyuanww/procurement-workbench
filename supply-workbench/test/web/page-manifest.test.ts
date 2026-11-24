import { expect, it } from 'vitest';
import { NAV_ROUTES, PAGE_MANIFEST } from '../../apps/web/src/app/page-manifest.js';

it('页面清单和导航从同一份清单派生', () => {
  expect(NAV_ROUTES.map((route) => route.to)).toEqual(['/progress', '/today', '/lines', '/dashboard', '/products', '/imports', '/master', '/settings']);
  expect(NAV_ROUTES.map((route) => route.label)).toEqual(['管理店铺', '今日', '跟进台', '管理看板', '产品档案', '导入中心', '主数据', '设置']);
  expect(NAV_ROUTES.map((route) => route.gate)).toEqual(['always', 'always', 'always', 'oversight', 'always', 'always', 'review', 'admin']);
  expect(NAV_ROUTES.find((route) => route.to === '/dashboard')?.matchPaths).toEqual(['/dashboard', '/reports']);
});

it('每个页面清单项都有自己的组件，路由路径不重复', () => {
  for (const entry of PAGE_MANIFEST) expect(entry.element, entry.path).toBeTruthy();
  expect(new Set(PAGE_MANIFEST.map((entry) => entry.path)).size).toBe(PAGE_MANIFEST.length);
});
