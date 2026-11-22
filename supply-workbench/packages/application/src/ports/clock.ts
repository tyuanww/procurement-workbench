import type { LocalDate } from '@sw/domain';

export interface Clock {
  /** ISO 8601，带时区。 */
  now(): string;
  /** 按 TZ_BUSINESS 取业务日，不读进程环境。 */
  today(): LocalDate;
}
