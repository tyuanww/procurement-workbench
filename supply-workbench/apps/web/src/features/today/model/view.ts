import { isPlanGroupMode } from './plan-board.js';
import type { GroupMode } from './types.js';

export const todayArrivalsPath = '/today?view=arrivals';

export type ArrivalTiming = 'overdue' | 'due_today';
export type ArrivalsView = { readonly focusBatch: string | null; readonly timing?: ArrivalTiming };

export function arrivalShortcutPath({ timing, returnSearch }: { readonly timing?: ArrivalTiming; readonly returnSearch: string }) {
  const path = new URLSearchParams();
  const action = new URLSearchParams(returnSearch);
  if (action.get('view') === 'arrivals') action.delete('view');
  for (const key of ['timing', 'focusBatch', 'actionReturn', 'drawer', 'draft']) action.delete(key);
  if (timing !== undefined) path.set('timing', timing);
  if (action.size > 0) path.set('actionReturn', action.toString());
  return path.size === 0 ? todayArrivalsPath : todayArrivalsPath + '&' + path;
}

/** 工作台和排期共享抽屉导航。 */
export type TodayView = 'action' | 'schedule';

export function todayViewOf(group: GroupMode): TodayView {
  if (isPlanGroupMode(group)) return 'schedule';
  return 'action';
}

export function todayViewFromKey(value: string): TodayView {
  if (value === 'schedule') return 'schedule';
  return 'action';
}

export function groupForView(view: TodayView): GroupMode {
  if (view === 'schedule') return 'schedule';
  return 'kanban';
}

/** 以前保存的个人工作台链接可以携带预约日期、抽屉或列表焦点。 */
export function legacyPersonalPath(search: string, today: string): string {
  const params = new URLSearchParams(search);
  const focus = params.get('focus');
  const scope = params.get('scope');
  const date = params.get('date') ?? today;
  const isFutureCalendar = params.get('view') === 'calendar' && date > today;
  params.delete('scope');
  params.delete('focus');
  if (focus) params.set('focusId', focus);
  if (scope === 'scheduled' || (scope !== 'pending' && isFutureCalendar)) params.set('inbox', 'scheduled');
  const query = params.toString();
  return query === '' ? '/today' : '/today?' + query;
}
