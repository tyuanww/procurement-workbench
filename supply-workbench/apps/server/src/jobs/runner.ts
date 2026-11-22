import { type LocalDate } from '@sw/domain';
import { weeklyReportTrigger } from './weekly-report.js';

export type JobTrigger = { readonly name: string; readonly cron: string | null; readonly run: () => Promise<void> };
export type JobScheduler = { schedule(input: { readonly name: string; readonly cron: string; readonly run: () => Promise<void> }): Promise<void> };

const DISCARD_CRON = '0 3 * * *';

export async function registerJobs(scheduler: JobScheduler, triggers: readonly JobTrigger[]): Promise<void> {
  for (const trigger of triggers) {
    if (trigger.cron === null) continue;
    await scheduler.schedule({ name: trigger.name, cron: trigger.cron, run: trigger.run });
  }
}

export function platformTriggers(input: {
  readonly weeklyCron: string | null;
  readonly today: () => LocalDate;
  readonly discardStale: () => Promise<void>;
  readonly generateWeekly: (weekStart: LocalDate) => Promise<void>;
}): JobTrigger[] {
  return [
    { name: 'discard-stale-imports', cron: DISCARD_CRON, run: input.discardStale },
    weeklyReportTrigger({ cron: input.weeklyCron, today: input.today, generate: input.generateWeekly }),
  ];
}
