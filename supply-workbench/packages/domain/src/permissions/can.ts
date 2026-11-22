import type { PermissionAction, Role } from '../vocabulary/index.js';

export type PermissionActor = {
  readonly roles: readonly Role[];
};

const GRANTS: Record<PermissionAction, readonly Role[]> = {
  'dashboard.read': ['manager', 'lead', 'admin'],
  'reports.read': ['manager', 'lead', 'admin'],
  'data.read': ['buyer', 'reviewer', 'manager', 'lead', 'admin'],
  'imports.read': ['buyer', 'reviewer', 'admin'],
  'master.read': ['reviewer', 'admin'],
  'products.read': ['buyer', 'reviewer', 'manager', 'lead', 'admin'],
  'plan.read': ['buyer', 'reviewer', 'manager', 'lead', 'admin'],
  'today.read': ['buyer', 'reviewer', 'manager', 'lead', 'admin'],
  'search.read': ['buyer', 'reviewer', 'manager', 'lead', 'admin'],
  'session.read': ['buyer', 'reviewer', 'manager', 'lead', 'admin'],
  'lines.write': ['buyer', 'admin'],
  'records.write': ['buyer', 'admin'],
  'imports.write': ['buyer', 'reviewer', 'admin'],
  'master.review': ['reviewer', 'admin'],
  'products.maintain': ['reviewer', 'admin'],
  'reports.generate': ['manager', 'admin'],
  'reports.export': ['manager', 'lead', 'admin'],
  admin: ['admin'],
};

export function can(actor: PermissionActor, action: PermissionAction): boolean {
  const granted = GRANTS[action];
  return actor.roles.some((role) => granted.some((allowed) => allowed === role));
}
