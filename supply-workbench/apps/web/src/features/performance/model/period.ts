import { addDays, businessDay, localDate, recentMonth, weekStart, type LocalDate } from '@sw/domain';
import { businessTimeZone } from '../../../shared/business-time-zone.js';

const PREVIOUS_WEEK_START = -7;
const PREVIOUS_WEEK_END = -1;
const FOUR_WEEK_START = -21;

export const DASHBOARD_PRESETS = [
  'recent-month',
  'this-week',
  'last-week',
  'four-weeks',
  'this-month',
  'custom',
] as const;
export type DashboardPreset = (typeof DASHBOARD_PRESETS)[number];
export type NamedPreset = Exclude<DashboardPreset, 'custom'>;

export type DateRange = { readonly from: LocalDate; readonly to: LocalDate };

export function shanghaiToday(now: Date, timeZone = businessTimeZone()): LocalDate {
  return businessDay(now.toISOString(), timeZone);
}

export function periodFor(preset: NamedPreset, today: LocalDate): DateRange {
  switch (preset) {
    case 'recent-month':
      return recentMonth(today);
    case 'this-week':
      return { from: weekStart(today), to: today };
    case 'last-week':
      return {
        from: addDays(weekStart(today), PREVIOUS_WEEK_START),
        to: addDays(weekStart(today), PREVIOUS_WEEK_END),
      };
    case 'four-weeks':
      return { from: addDays(weekStart(today), FOUR_WEEK_START), to: today };
    case 'this-month':
      return { from: monthStart(today), to: today };
    default:
      return unexpectedPreset(preset);
  }
}

function monthStart(today: LocalDate): LocalDate {
  const [year, month] = today.split('-');
  if (year === undefined || month === undefined) return today;
  return localDate(`${year}-${month}-01`);
}

function unexpectedPreset(preset: never): never {
  throw new Error(`未知期间 ${String(preset)}`);
}
