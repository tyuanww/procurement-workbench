import { StuckDashboardSchema, type StuckDashboard } from '@sw/contracts';
import { apiGet } from '../../shared/api/client.js';
import { appendStuckFilters, type DashboardQuery } from './model/query.js';

export type LoadStuckInput = Pick<DashboardQuery, 'from' | 'to' | 'lane' | 'stage' | 'bucket' | 'cause' | 'card' | 'page'>;

export function loadStuck(input: LoadStuckInput): Promise<StuckDashboard> {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.lane !== 'all') params.set('lane', input.lane);
  appendStuckFilters(params, input);
  return apiGet(`/api/v1/dashboard/stuck?${params}`, StuckDashboardSchema);
}
