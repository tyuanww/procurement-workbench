import { addDays, weekStart, type LocalDate } from '@sw/domain';

const DAYS_PER_WEEK = 7;

export function weeklyReportTrigger(input: {
  readonly cron: string | null;
  readonly today: () => LocalDate;
  readonly generate: (weekStart: LocalDate) => Promise<void>;
}): { readonly name: string; readonly cron: string | null; readonly run: () => Promise<void> } {
  return {
    name: 'weekly-report-generate',
    cron: input.cron,
    run: () => input.generate(addDays(weekStart(input.today()), -DAYS_PER_WEEK)),
  };
}
