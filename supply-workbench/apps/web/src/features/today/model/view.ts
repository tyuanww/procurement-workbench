import { isPlanGroupMode } from './plan-board.js';
import type { GroupMode } from './types.js';

export const todayArrivalsPath = '/today?view=arrivals';

/** 行动板是默认视图，排期是辅助视图。 */
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
  return 'waiting';
}
