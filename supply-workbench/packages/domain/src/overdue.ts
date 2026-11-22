import type { LocalDate } from './values/local-date.js';
import type { BatchStatus } from './vocabulary/index.js';
import { diffDays } from './dates.js';
import { isOpenBatch } from './batch/status.js';

type DatedBatch = {
  readonly status: BatchStatus;
  readonly dateBuyerConfirmed: LocalDate | null;
};

export function overdueDays(batch: DatedBatch, today: LocalDate): number | null {
  if (!isOpenBatch(batch.status) || batch.dateBuyerConfirmed === null) return null;
  const late = diffDays(today, batch.dateBuyerConfirmed);
  if (late <= 0) return null;
  return late;
}

export function isDueToday(batch: DatedBatch, today: LocalDate): boolean {
  return isOpenBatch(batch.status) && batch.dateBuyerConfirmed === today;
}

export function isUpcoming({ batch, today, upcomingDays }: { readonly batch: DatedBatch; readonly today: LocalDate; readonly upcomingDays: number }): boolean {
  if (!Number.isFinite(upcomingDays)) throw new Error('提前期必须是有限数字');
  if (!isOpenBatch(batch.status) || batch.dateBuyerConfirmed === null) return false;
  const ahead = diffDays(batch.dateBuyerConfirmed, today);
  return ahead > 0 && ahead <= upcomingDays;
}
