import { expect, it } from 'vitest';
import type { Role } from '../../packages/domain/src/index.js';
import { routeAccess } from '../../apps/web/src/features/shell/index.js';
import type { PageGate } from '../../apps/web/src/shared/page-manifest.js';

const allowed = {
  always: ['buyer', 'reviewer', 'manager', 'lead', 'admin'],
  oversight: ['manager', 'lead', 'admin'],
  imports: ['buyer', 'reviewer', 'admin'],
  review: ['reviewer', 'admin'],
  admin: ['admin'],
} satisfies Record<PageGate, readonly Role[]>;

it.each(['always', 'oversight', 'imports', 'review', 'admin'] satisfies PageGate[])('%s 页面按角色门禁开放', (gate) => {
  const openRoles: readonly Role[] = allowed[gate];
  for (const role of allowed.always) {
    expect(routeAccess({ roles: [role], gate }), role).toBe(openRoles.includes(role) ? 'open' : 'forbidden');
  }
  expect(routeAccess({ roles: [], gate })).toBe(gate === 'always' ? 'open' : 'forbidden');
});
