export const settingsSectionLabels = { users: '用户', settings: '阈值', audit: '审计' } as const;

export function settingsSection(params: URLSearchParams) {
  const defaultSection = params.get('entity') ? 'audit' : 'users';
  const value = params.get('section');
  const activeKey = value === 'users' || value === 'settings' || value === 'audit' ? value : defaultSection;
  return { activeKey, defaultSection } as const;
}
