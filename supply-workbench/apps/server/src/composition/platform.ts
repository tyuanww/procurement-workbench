import {
  activeAdminActor,
  makeCreateUser,
  makeDiscardStaleImports,
  makeGetFreshness,
  makeGetSettings,
  makeListAuditEntries,
  makeListUsers,
  makeUpdateSettings,
  makeUpdateUser,
} from '@sw/application';
import {
  auditQueries,
  databaseHealth,
  auditRepository,
  createUnitOfWork,
  deliveryBatchRepository,
  exceptionRepository,
  followUpRepository,
  freshnessQueries,
  orderLineRepository,
  placeholderStores,
  requireDatabase,
  settingsRepository,
  userRepository,
  type AppDatabase,
  type SqlExec,
} from '@sw/persistence';
import type { PlatformApi } from '../http/platform-api.js';
import { composeReporting } from './reporting.js';
import { platformTriggers, type JobTrigger } from '../jobs/runner.js';
import { systemClock } from '../system/clock.js';
import { systemIds } from '../system/ids.js';

export function register(): never {
  throw new Error('平台路由由 buildHttpApp 挂载');
}

export function platformHealth(exec: SqlExec): ReturnType<typeof databaseHealth> {
  return databaseHealth(exec);
}

export function composePlatform(input: { readonly db: AppDatabase; readonly timeZone: string; readonly weeklyCron: string | null; readonly files: PlatformApi['files']; readonly health: PlatformApi['health'] }): { readonly api: PlatformApi; readonly triggers: JobTrigger[] } {
  const clock = systemClock(input.timeZone);
  const ids = systemIds();
  const freshness = freshnessQueries(input.db);
  const uow = createUnitOfWork(input.db, (tx) => stores(requireDatabase(tx)));
  const write = { uow, clock, ids };
  const runs = scheduledRuns({ db: input.db, uow, clock });
  return {
    api: {
      health: input.health,
      getSettings: makeGetSettings({ settings: settingsRepository(input.db) }),
      updateSettings: makeUpdateSettings({ ...write, settings: settingsRepository(input.db) }),
      listUsers: makeListUsers({ users: userRepository(input.db) }),
      createUser: makeCreateUser(write),
      updateUser: makeUpdateUser(write),
      listAudit: makeListAuditEntries({ audit: auditQueries(input.db) }),
      getFreshness: makeGetFreshness({ freshness }),
      files: input.files,
    },
    triggers: platformTriggers({
      weeklyCron: input.weeklyCron,
      today: () => clock.today(),
      discardStale: runs.discardStale,
      generateWeekly: (weekStart) => composeReporting({ db: input.db, timeZone: input.timeZone, secret: 'schedule' }).generateScheduled(weekStart),
    }),
  };
}

function scheduledRuns(input: { readonly db: AppDatabase; readonly uow: ReturnType<typeof createUnitOfWork>; readonly clock: ReturnType<typeof systemClock> }) {
  const discard = makeDiscardStaleImports({ uow: input.uow, clock: input.clock });
  return {
    discardStale: async () => {
      const actor = await activeAdminActor(userRepository(input.db));
      await discard({}, actor);
    },
  };
}

function stores(db: AppDatabase) {
  return {
    ...placeholderStores(),
    users: userRepository(db),
    settings: settingsRepository(db),
    orderLines: orderLineRepository(db),
    batches: deliveryBatchRepository(db),
    exceptions: exceptionRepository(db),
    followUps: followUpRepository(db),
    audit: auditRepository(db),
  };
}
