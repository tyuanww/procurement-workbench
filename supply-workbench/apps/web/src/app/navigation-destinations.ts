import { matchPath } from 'react-router';
import { currentProgressPath, isScheduleRiskAddress, progressViewOf, schedulePath, scheduleRiskLabel, type PlanningEntry } from '../features/progress/index.js';
import { planningScope, planningSectionOf, planningSectionPath, planningSections } from '../pages/progress/planning-navigation.js';
import { todaySectionOf, todaySectionPath, todaySections } from '../pages/today/today-section-navigation.js';
import type { NavDestination, NavPath } from '../shared/page-manifest.js';

export const destinations: Partial<Record<NavPath, readonly NavDestination[]>> = {
  '/today': todaySections.map(({ to, label }) => ({ to, label })),
  '/progress': [
    ...planningSections.map(({ key, to, label }) => ({
      to, label, aliases: [key === 'development' ? '/progress?view=development' : '/progress?view=schedule'],
    })),
    { to: currentProgressPath, label: '当前进度', aliases: ['/progress?view=current'] },
  ],
  '/dashboard': [
    { to: '/dashboard', label: '卡点' },
    { to: '/dashboard?view=suppliers', label: '供应商表现' },
    { to: '/dashboard?view=buyers', label: '采购负荷' },
    { to: `${schedulePath}?lens=risk`, label: scheduleRiskLabel, aliases: ['/dashboard?view=project'] },
    { to: '/dashboard?view=meeting', label: '管理周会' },
    { to: '/reports', label: '周报（待开发）' },
  ],
  '/imports': [
    { to: '/imports', label: '导入中心' },
    { to: '/master', label: '别名审核', gate: 'review' },
    { to: '/master?tab=multi', label: '一号多名', gate: 'review' },
    { to: '/master?tab=owner-map', label: '负责人映射', gate: 'review' },
    { to: '/master?tab=factory-link', label: '工厂待处理', gate: 'review', aliases: ['/master?tab=unlinked'] },
    { to: '/master?tab=factory-link&scope=active', label: '当前关联诊断', gate: 'review', aliases: ['/master?tab=unlinked&scope=active'] },
    { to: '/master?tab=factory-link&scope=historical', label: '历史关联诊断', gate: 'review', aliases: ['/master?tab=unlinked&scope=historical'] },
  ],
};

type TabGroup = '/today' | '/progress';
type TabLocation = { readonly pathname: string; readonly search: string };

export function tabDestination(group: TabGroup, location: TabLocation): string | undefined {
  const params = new URLSearchParams(location.search);
  if (group === '/today') return todaySections.find(({ key }) => key === todaySectionOf(params))?.to;

  if (isScheduleRiskAddress(location.pathname, location.search)) return undefined;
  if (matchPath(currentProgressPath, location.pathname) !== null) return currentProgressPath;
  const explicit = planningSections.find(({ to }) => matchPath(to, location.pathname) !== null);
  if (explicit !== undefined) return planningDestination(params, explicit.key);
  if (matchPath('/progress', location.pathname) === null) return undefined;
  const view = progressViewOf(params.get('view'));
  return view === 'current' ? currentProgressPath : planningDestination(params, view === 'development' ? 'development' : 'orders');
}

function planningDestination(params: URLSearchParams, entry: PlanningEntry) {
  const current = planningSectionOf(planningScope(params, entry));
  return planningSections.find(({ key }) => key === current)?.to;
}

export function tabDestinationHref(input: { readonly group: NavPath; readonly to: string; readonly location: TabLocation }): string | undefined {
  const { group, to, location } = input;
  const search = matchPath({ path: group, end: false }, location.pathname) === null ? '' : location.search;
  if (group === '/today') {
    const section = todaySections.find((item) => item.to === to);
    if (section !== undefined) return todaySectionPath({ to: section.key, search });
  }
  if (group === '/progress') {
    if (to === currentProgressPath) {
      const current = new URLSearchParams([...new URLSearchParams(search)].filter(([key]) => key === 'store' || key === 'scope'));
      return current.size === 0 ? to : `${to}?${current}`;
    }
    const section = planningSections.find((item) => item.to === to);
    if (section !== undefined) return planningSectionPath({ to: section.key, search });
  }
  return undefined;
}
