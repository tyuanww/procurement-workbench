import { NAV_ROUTES } from '../../apps/web/src/app/page-manifest.js';
import { expect, it } from 'vitest';
import type { Role } from '../../packages/domain/src/index.js';
import { routeAccess, shellView } from '../../apps/web/src/features/shell/index.js';

const NOW = '2026-10-18T00:00:00.000Z';
const GROUPS: readonly (readonly Role[])[] = [['buyer'], ['reviewer'], ['manager'], ['lead'], ['admin'], []];

it('导航里有的路径才开放，子路径跟着父路径', () => {
  const adminPaths = navOf(['admin']);
  for (const roles of GROUPS) {
    const paths = navOf(roles);
    for (const path of adminPaths) {
      const access = paths.includes(path) ? 'open' : 'forbidden';
      expect(routeAccess({ navRoutes: NAV_ROUTES, roles, pathname: path })).toBe(access);
    }
  }
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['buyer'], pathname: '/reports/r1' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['buyer'], pathname: '/reports/r1/print' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['lead'], pathname: '/reports/r1' })).toBe('open');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['lead'], pathname: '/reports/r1/print' })).toBe('open');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['buyer'], pathname: '/lines/l1' })).toBe('open');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['buyer'], pathname: '/parties/p1' })).toBe('open');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['buyer'], pathname: '/dashboard' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['reviewer'], pathname: '/dashboard' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['buyer'], pathname: '/reports' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['reviewer'], pathname: '/reports' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['buyer'], pathname: '/settings' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['reviewer'], pathname: '/settings' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['reviewer'], pathname: '/master' })).toBe('open');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['admin'], pathname: '/master' })).toBe('open');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['manager'], pathname: '/master' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['lead'], pathname: '/master' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['manager'], pathname: '/settings' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['lead'], pathname: '/settings' })).toBe('forbidden');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['admin'], pathname: '/dashboard' })).toBe('open');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['admin'], pathname: '/reports' })).toBe('open');
  expect(routeAccess({ navRoutes: NAV_ROUTES, roles: ['admin'], pathname: '/settings' })).toBe('open');
});

function navOf(roles: readonly Role[]): readonly string[] {
  return shellView({
    user: { name: '用户', roles },
    queue: { kind: 'known', aliases: 0, codes: 0, links: 0, multiName: 0 },
    today: { kind: 'pending' },
    freshness: { kind: 'pending' },
    now: NOW,
    navRoutes: NAV_ROUTES,
  }).nav.map((row) => row.to);
}
