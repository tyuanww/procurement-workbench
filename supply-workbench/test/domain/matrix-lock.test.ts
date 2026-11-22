import { expect, it } from 'vitest';
import { PERMISSION_ACTIONS, ROLES, can, entityId, type PermissionAction, type Role } from '../../packages/domain/src/index.js';
import { authorize } from '../../packages/application/src/shared/authorize.js';
import { ForbiddenError } from '../../packages/application/src/shared/errors.js';

it('authorize 和按钮用的 can 对每个角色和动作一致', () => {
  let checked = 0;
  for (const role of ROLES) {
    for (const action of PERMISSION_ACTIONS) {
      expect(isRefused(role, action)).toBe(!can({ roles: [role] }, action));
      checked += 1;
    }
  }
  expect(checked).toBe(ROLES.length * PERMISSION_ACTIONS.length);
});

function isRefused(role: Role, action: PermissionAction): boolean {
  try {
    authorize({ id: entityId('0199f0a0-0000-7000-8000-000000000099'), name: role, roles: [role] }, action);
    return false;
  } catch (error) {
    if (error instanceof ForbiddenError) return true;
    throw error;
  }
}
