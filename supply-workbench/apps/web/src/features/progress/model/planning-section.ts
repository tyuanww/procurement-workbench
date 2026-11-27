export const planningLabels = { orders: '订单与任务排期', development: '新品开发' } as const;
export const currentProgressPath = '/progress/current';
export type PlanningEntry = keyof typeof planningLabels;
export type PlanningScope = PlanningEntry | 'all';
export type ProgressView = 'current' | 'schedule' | 'development';

export function progressViewOf(value: string | null): ProgressView {
  return value === 'current' || value === 'development' ? value : 'schedule';
}

export function planningScope(params: URLSearchParams, entry: PlanningEntry): PlanningScope {
  const value = params.get('planScope');
  return value === 'all' || value === 'orders' || value === 'development' ? value : entry;
}

export function planningSectionOf(scope: PlanningScope): PlanningEntry {
  return scope === 'development' ? 'development' : 'orders';
}
