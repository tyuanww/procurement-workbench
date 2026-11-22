import { businessDay, diffDays } from '../dates.js';
import type { IsoInstant } from '../entities/entity-meta.js';
import type { LocalDate } from '../values/local-date.js';

export function daysInStage({ stageChangedAt, today, timeZone }: { readonly stageChangedAt: IsoInstant; readonly today: LocalDate; readonly timeZone: string }): number {
  return diffDays(today, businessDay(stageChangedAt, timeZone));
}
