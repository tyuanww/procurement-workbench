import { arrivalShortcutPath, isPlanGroupMode, todayArrivalsPath, todayViewOf, type TodayView } from '../../features/today/index.js';
import { screenView } from './today-session.js';

export type TodaySection = TodayView | 'arrivals';

export const todaySections = [
  { key: 'action', label: '行动板', to: '/today' },
  { key: 'arrivals', label: '在途待收', to: todayArrivalsPath },
  { key: 'schedule', label: '今日排期', to: '/today?group=schedule' },
] satisfies readonly { readonly key: TodaySection; readonly label: string; readonly to: string }[];

export function todaySectionOf(params: URLSearchParams): TodaySection {
  const { arrivalsView, group } = screenView(params);
  return arrivalsView === undefined ? todayViewOf(group) : 'arrivals';
}

export function todaySectionPath({ to, search }: { readonly to: TodaySection; readonly search: string }): string {
  const action = actionSearch(search);
  for (const key of ['drawer', 'draft']) action.delete(key);
  if (to === 'action') return action.size === 0 ? '/today' : '/today?' + action;
  if (to === 'arrivals') return arrivalShortcutPath({ returnSearch: action.toString() });
  const schedule = new URLSearchParams({ group: 'schedule' });
  if (action.size > 0) schedule.set('workspaceReturn', action.toString());
  return '/today?' + schedule;
}

function actionSearch(search: string): URLSearchParams {
  let candidate = new URLSearchParams(search);
  while (true) {
    const { arrivalsView, group } = screenView(candidate);
    if (arrivalsView !== undefined) candidate = new URLSearchParams(candidate.get('actionReturn') ?? '');
    else if (isPlanGroupMode(group)) candidate = new URLSearchParams(candidate.get('workspaceReturn') ?? '');
    else return candidate;
  }
}
