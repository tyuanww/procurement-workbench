import { describe, expect, it } from 'vitest';
import { SETTING_FIELDS, auditChanged, userPatch } from '../../apps/web/src/features/platform/model/settings.js';

describe('设置页', () => {
  it('可以改角色和停用，阈值每项有说明和默认值', () => {
    expect(userPatch({ roles: ['buyer'], active: false })).toEqual({ roles: ['buyer'], active: false });
    expect(SETTING_FIELDS.every((field) => field.hint.length > 0 && field.defaultValue !== undefined)).toBe(true);
  });

  it('审计展开能看出修改前后不一样', () => {
    expect(auditChanged({ upcomingDays: 3 }, { upcomingDays: 6 })).toBe(true);
    expect(auditChanged({ upcomingDays: 3 }, { upcomingDays: 3 })).toBe(false);
  });
});
