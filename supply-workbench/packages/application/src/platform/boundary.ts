import type { Actor } from '../shared/actor.js';
import type { NoInput } from '../shared/refs.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { SettingsRepository } from '../ports/settings-repository.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { AuditQueries } from '../ports/audit-queries.js';
import type { FreshnessQueries } from '../ports/freshness-queries.js';
import type { ListResult } from '../shared/page.js';
import type {
  AuditEntryView,
  AuditQuery,
  CreateUserInput,
  FreshnessResponse,
  Settings,
  UpdateSettingsInput,
  UpdateUserInput,
  UserView,
} from './views.js';

export type * from './views.js';

type AdminWrite = {
  readonly uow: UnitOfWork;
  readonly clock: Clock;
  readonly ids: IdGenerator;
};

export type ListUsersDeps = { readonly users: UserRepository };
export type ListUsers = (input: NoInput, actor: Actor) => Promise<readonly UserView[]>;

export type CreateUserDeps = AdminWrite;
export type CreateUser = (input: CreateUserInput, actor: Actor) => Promise<{ readonly userId: string }>;

export type UpdateUserDeps = AdminWrite;
export type UpdateUser = (input: UpdateUserInput, actor: Actor) => Promise<{ readonly userId: string }>;

export type GetSettingsDeps = { readonly settings: SettingsRepository };
export type GetSettings = (input: NoInput, actor: Actor) => Promise<Settings>;

export type UpdateSettingsDeps = AdminWrite & { readonly settings: SettingsRepository };
export type UpdateSettings = (input: UpdateSettingsInput, actor: Actor) => Promise<{ readonly updated: true }>;

export type ListAuditEntriesDeps = { readonly audit: AuditQueries };
export type ListAuditEntries = (input: AuditQuery, actor: Actor) => Promise<ListResult<AuditEntryView>>;

export type GetFreshnessDeps = { readonly freshness: FreshnessQueries };
export type GetFreshness = (input: NoInput, actor: Actor) => Promise<FreshnessResponse>;
