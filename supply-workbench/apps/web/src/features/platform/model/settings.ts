import { ROLES, roleLabel, type Role } from '@sw/domain';

export function roleOptions(): readonly { readonly code: Role; readonly text: string }[] {
  return ROLES.map((code) => ({ code, text: roleLabel(code) }));
}

export function selectedRoles(codes: readonly string[]): { readonly ok: true; readonly roles: readonly Role[] } | { readonly ok: false; readonly message: string } {
  const roles = codes.flatMap((code) => {
    const known = ROLES.find((role) => role === code);
    return known === undefined ? [] : [known];
  });
  if (roles.length === 0) return { ok: false, message: '至少选一个角色' };
  return { ok: true, roles };
}

export function userPatch(input: { readonly name?: string; readonly roles?: readonly string[]; readonly active?: boolean }) {
  return {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.roles === undefined ? {} : { roles: input.roles }),
    ...(input.active === undefined ? {} : { active: input.active }),
  };
}

export const SETTING_FIELDS = [
  { key: 'upcomingDays', label: '即将到期天数', hint: '今天之后多少天内的批次算即将到期', defaultValue: 3 },
  { key: 'deliveryNoteAlertDays', label: '送货单未回天数', hint: '发货后多少天送货单还没回就提醒', defaultValue: 7 },
] as const;

export function auditChanged(before: unknown, after: unknown): boolean {
  return JSON.stringify(before) !== JSON.stringify(after);
}
