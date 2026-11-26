import { addDays, localDate, weekStart } from '@sw/domain';
import { z } from 'zod';

const identity = { id: z.string().min(1), title: z.string().trim().min(1) };
const task = z.object({
  ...identity, description: z.string(), due: z.iso.date(),
  priority: z.enum(['high', 'normal', 'low']), status: z.enum(['todo', 'doing', 'done']),
});
const event = z.object({ ...identity, category: z.string(), start: z.string(), end: z.string(), location: z.string() });
export const entrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), item: task }),
  z.object({ kind: z.literal('event'), item: event }),
]);
export type PersonalTask = z.infer<typeof task>;
export type PersonalEvent = z.infer<typeof event>;
export type WorkspaceEntry = z.infer<typeof entrySchema>;
export type MetricScope = 'all' | 'due' | 'soon' | 'done';

export function shiftDay(day: string, offset: number): string {
  return addDays(localDate(day), offset);
}

const SOON_DAYS = 3;
const WEEK_DAYS = 7;
export function matchesMetric(item: PersonalTask, { scope, today }: { scope: MetricScope; today: string }): boolean {
  switch (scope) {
    case 'all': return true;
    case 'due': return item.status !== 'done' && item.due === today;
    case 'soon': return item.status !== 'done' && item.due > today && item.due <= shiftDay(today, SOON_DAYS);
    case 'done': {
      const start = weekStart(localDate(today));
      return item.status === 'done' && item.due >= start && item.due < shiftDay(start, WEEK_DAYS);
    }
  }
}
