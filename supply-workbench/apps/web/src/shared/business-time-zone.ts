import { DEFAULT_BUSINESS_TIME_ZONE } from './config.js';

export type BusinessTimeZone = string;

let current: BusinessTimeZone = DEFAULT_BUSINESS_TIME_ZONE;

export function businessTimeZone(): BusinessTimeZone {
  return current;
}

export function setBusinessTimeZone(timeZone: BusinessTimeZone): void {
  if (!isValidBusinessTimeZone(timeZone)) throw new Error(`无效业务时区 ${timeZone}`);
  current = timeZone;
}

export function isValidBusinessTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}
