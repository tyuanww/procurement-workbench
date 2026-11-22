import { WorkItemVersionResponseSchema } from '@sw/contracts';
import { apiSend } from '../../shared/api/client.js';
import { read } from '../../shared/api/reads.js';
import { businessToday } from '../follow-up/index.js';
import type { DailyPlan, WorkItemDetail, WorkItemStatus } from '../../features/today/index.js';

export function todayPlanDate(): string {
  return businessToday();
}

export function loadDailyPlan(date = businessToday()): Promise<DailyPlan> {
  return read({ name: 'planDaily', date });
}

export function loadWorkItem(id: string): Promise<WorkItemDetail> {
  return read({ name: 'planWorkItem', id });
}

export function changeWorkItemStatus(input: {
  readonly id: string;
  readonly status: WorkItemStatus;
}): Promise<{ readonly workItemId: string; readonly version: number }> {
  return apiSend({
    path: `/api/v1/plan/work-items/${encodeURIComponent(input.id)}/status`,
    method: 'POST',
    body: { status: input.status },
    schema: WorkItemVersionResponseSchema,
  });
}
