import { diffDays } from '../../../../domain/src/dates.js';
import { isOpenWorkItemStatus } from '../../../../domain/src/entities/work-items.js';
import type { LocalDate } from '../../../../domain/src/values/local-date.js';
import type { WorkItemView } from '../views.js';

export function annotateOverdue(items: readonly WorkItemView[], today: LocalDate): readonly WorkItemView[] {
  return items.map((item) => {
    const days = diffDays(today, item.plannedEnd);
    return { ...item, overdueDays: days > 0 && isOpenWorkItemStatus(item.status) ? days : null };
  });
}
