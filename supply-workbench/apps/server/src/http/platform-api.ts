import type {
  CreateUser,
  GetFreshness,
  GetSettings,
  ListAuditEntries,
  ListUsers,
  UpdateSettings,
  UpdateUser,
} from '@sw/application';
import type { SessionUser } from '@sw/contracts';

export type PlatformApi = {
  readonly health: () => Promise<{ readonly ok: boolean; readonly db: 'up' | 'down'; readonly migration: string }>;
  readonly getSettings: GetSettings;
  readonly updateSettings: UpdateSettings;
  readonly listUsers: ListUsers;
  readonly createUser: CreateUser;
  readonly updateUser: UpdateUser;
  readonly listAudit: ListAuditEntries;
  readonly getFreshness: GetFreshness;
  readonly files: { read(id: string): Promise<Uint8Array | undefined> };
};

export type Actor = SessionUser;
