import { expect, it } from 'vitest';
import { NAV_ROUTES, PAGE_MANIFEST } from '../../apps/web/src/app/page-manifest.js';

it('页面清单和导航从同一份清单派生', () => {
  expect(NAV_ROUTES.map((route) => route.to)).toEqual(['/today', '/progress', '/lines', '/dashboard', '/products', '/imports']);
  expect(NAV_ROUTES.map((route) => route.label)).toEqual(['今日事项', '管理店铺', '跟进中心', '管理看板', '产品档案', '导入与审核']);
  expect(NAV_ROUTES.map((route) => route.gate)).toEqual(['always', 'always', 'always', 'oversight', 'always', 'imports']);
  expect(NAV_ROUTES.find((route) => route.to === '/dashboard')?.matchPaths).toEqual(['/dashboard', '/reports']);
  expect(NAV_ROUTES.find((route) => route.to === '/imports')?.matchPaths).toEqual(['/imports', '/imports/:id', '/master']);
  expect(PAGE_MANIFEST.find((entry) => entry.path === '/settings')).toMatchObject({ nav: null, gate: 'admin' });
});

it('每个页面清单项都有自己的组件，路由路径不重复', () => {
  for (const entry of PAGE_MANIFEST) expect(entry.element, entry.path).toBeTruthy();
  expect(new Set(PAGE_MANIFEST.map((entry) => entry.path)).size).toBe(PAGE_MANIFEST.length);
});
