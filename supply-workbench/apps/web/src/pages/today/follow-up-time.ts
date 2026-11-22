import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { businessTimeZone } from '../../shared/business-time-zone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const INPUT_FORMAT = 'YYYY-MM-DDTHH:mm';

export function localFollowUpTime(instant: string | undefined): string {
  return instant === undefined ? '' : dayjs(instant).tz(businessTimeZone()).format(INPUT_FORMAT);
}

export function reminderChangeOf(local: string | undefined, current: string | undefined): { readonly nextFollowUpAt?: string | null } {
  if (local === undefined || local === localFollowUpTime(current)) return {};
  if (local === '') return { nextFollowUpAt: null };
  const nextFollowUpAt = followUpInstant(local);
  if (nextFollowUpAt === null) throw new Error('请选择有效的业务日期和时间');
  return { nextFollowUpAt };
}

export function followUpInstant(local: string): string | null {
  const wall = dayjs.utc(local);
  if (!wall.isValid() || wall.format(INPUT_FORMAT) !== local) return null;

  const zone = businessTimeZone();
  const offsets = new Set([wall.subtract(1, 'day'), wall, wall.add(1, 'day')].map((day) => day.tz(zone).utcOffset()));
  const matches = [...offsets]
    .map((offset) => wall.subtract(offset, 'minute'))
    .filter((instant) => instant.tz(zone).format(INPUT_FORMAT) === local);
  return matches.length === 1 ? matches[0]?.toISOString() ?? null : null;
}
