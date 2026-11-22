import { expect, it } from 'vitest';
import { PERMISSION_ACTIONS, ROLES, can, type PermissionAction, type Role } from '../../packages/domain/src/index.js';

const ALLOWED: Record<Role, readonly PermissionAction[]> = {
  buyer: ['data.read', 'imports.read', 'products.read', 'plan.read', 'today.read', 'search.read', 'session.read', 'lines.write', 'records.write', 'imports.write'],
  reviewer: ['data.read', 'imports.read', 'master.read', 'products.read', 'plan.read', 'today.read', 'search.read', 'session.read', 'imports.write', 'master.review', 'products.maintain'],
  manager: ['dashboard.read', 'reports.read', 'data.read', 'products.read', 'plan.read', 'today.read', 'search.read', 'session.read', 'reports.generate', 'reports.export'],
  lead: ['dashboard.read', 'reports.read', 'data.read', 'products.read', 'plan.read', 'today.read', 'search.read', 'session.read', 'reports.export'],
  admin: [
    'dashboard.read',
    'reports.read',
    'data.read',
    'imports.read',
    'master.read',
    'products.read',
    'plan.read',
    'today.read',
    'search.read',
    'session.read',
    'lines.write',
    'records.write',
    'imports.write',
    'master.review',
    'products.maintain',
    'reports.generate',
    'reports.export',
    'admin',
  ],
};

for (const role of ROLES) {
  for (const action of PERMISSION_ACTIONS) {
    const isAllowed = ALLOWED[role].some((item) => item === action);
    it(`${role} ${isAllowed ? '可以' : '不可以'} ${action}`, () => {
      expect(can({ roles: [role] }, action)).toBe(isAllowed);
    });
  }
}

it('多个角色取并集，没有角色什么都不能写', () => {
  expect(can({ roles: ['reviewer', 'manager'] }, 'master.review')).toBe(true);
  expect(can({ roles: ['reviewer', 'manager'] }, 'reports.generate')).toBe(true);
  expect(can({ roles: ['reviewer', 'manager'] }, 'lines.write')).toBe(false);
  for (const action of PERMISSION_ACTIONS) {
    expect(can({ roles: [] }, action)).toBe(false);
  }
});
