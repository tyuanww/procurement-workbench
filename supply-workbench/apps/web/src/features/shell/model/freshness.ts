import { businessDay } from '@sw/domain';
import { businessTimeZone } from '../../../shared/business-time-zone.js';

export function procurementCutoff(uploadedAt: string | undefined, timeZone = businessTimeZone()): string | null {
  if (uploadedAt === undefined || !Number.isFinite(Date.parse(uploadedAt))) return null;
  return businessDay(uploadedAt, timeZone);
}
