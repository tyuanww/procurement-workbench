import type { Actor } from '../shared/actor.js';
import type { Clock } from '../ports/clock.js';
import type { SettingsRepository } from '../ports/settings-repository.js';
import type { TodayReadModel } from '../ports/today-read-model.js';
import type { TodayChaseQuery, TodayChaseRow, TodayPageQuery, TodayPageResponse, TodayQuery, TodayResponse } from './views.js';

export type * from './views.js';

export type GetTodayDeps = {
  readonly today: TodayReadModel;
  readonly settings: SettingsRepository;
  readonly clock: Clock;
};
export type GetToday = {
  (input: TodayQuery, actor: Actor): Promise<TodayResponse>;
  page(input: TodayPageQuery, actor: Actor): Promise<TodayPageResponse>;
  chase(input: TodayChaseQuery, actor: Actor): Promise<readonly TodayChaseRow[]>;
};
