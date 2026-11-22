import { compareDates, diffDays } from '../../../../domain/src/dates.js';
import type { LocalDate } from '../../../../domain/src/values/local-date.js';
import type { WorkItemView } from '../views.js';

/** 已逾期返回逾期天数（>0），未到期返回 null；今天到期不算逾期。 */
export function overdueDaysOf(plannedEnd: LocalDate, today: LocalDate): number | null {
  if (compareDates(plannedEnd, today) >= 0) return null;
  return diffDays(today, plannedEnd);
}

export function annotateOverdue(items: readonly WorkItemView[], today: LocalDate): readonly WorkItemView[] {
  return items.map((item) => ({ ...item, overdueDays: overdueDaysOf(item.plannedEnd, today) }));
}
