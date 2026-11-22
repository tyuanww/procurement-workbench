import { makeGetToday } from '@sw/application';
import type { LocalDate } from '@sw/domain';
import { settingsRepository, todayQueries, type AppDatabase } from '@sw/persistence';
import type { TodayApi } from '../http/today/routes.js';
import { systemClock } from '../system/clock.js';

type Clock = { now(): string; today(): LocalDate };

export function register(): never {
  throw new Error('今日路由由 buildHttpApp 挂载');
}

export function composeToday(input: { readonly db: AppDatabase; readonly timeZone: string; readonly clock?: Clock }): TodayApi {
  const clock = input.clock ?? systemClock(input.timeZone);
  return { getToday: makeGetToday({ today: todayQueries({ db: input.db, timeZone: input.timeZone }), settings: settingsRepository(input.db), clock }) };
}
