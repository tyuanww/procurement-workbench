// 公历月长是这张表本身。拆成一串命名常量会把表弄散，所以数字留在这里。
export const MONTH_LENGTHS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
export const LEAP_DAY = 29;
export const FEBRUARY = 2;
export const LEAP_EVERY_YEARS = 4;
export const CENTURY_YEARS = 100;
export const GREGORIAN_CYCLE_YEARS = 400;

export function isLeapYear(year: number): boolean {
  if (year % LEAP_EVERY_YEARS !== 0) return false;
  if (year % CENTURY_YEARS !== 0) return true;
  return year % GREGORIAN_CYCLE_YEARS === 0;
}

export function daysInMonth(year: number, month: number): number {
  const common = MONTH_LENGTHS[month];
  if (common === undefined) return 0;
  if (month === FEBRUARY && isLeapYear(year)) return LEAP_DAY;
  return common;
}
