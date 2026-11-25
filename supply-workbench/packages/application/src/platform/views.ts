import type { LocalDate, Role, Settings, TemplateId } from '@sw/domain';
import type { PageQuery } from '../shared/page.js';
import type { UserRef } from '../shared/refs.js';

export type UserView = {
  readonly id: string;
  readonly name: string;
  readonly roles: readonly Role[];
  readonly active: boolean;
  readonly feishuOpenId: string | null;
};

export type AuditEntryView = {
  readonly id: string;
  readonly actorUserId: string;
  readonly action: string;
  readonly entity: string;
  readonly entityId: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly at: string;
};

export type FreshnessSource = {
  readonly template: TemplateId;
  readonly factoryPartyId: string | null;
  readonly label: string;
  readonly lastCommittedAt: string | null;
  readonly fileModifiedAt: string | null;
};

export type FreshnessResponse = {
  readonly sources: readonly FreshnessSource[];
  readonly procurementUploadedAt?: string | undefined;
};

export type CreateUserInput = { readonly name: string; readonly roles: readonly Role[] };
export type UpdateUserInput = { readonly userId: string; readonly name?: string; readonly roles?: readonly Role[]; readonly active?: boolean };
export type UpdateSettingsInput = { readonly patch: Partial<Settings> };
export type AuditQuery = PageQuery & {
  readonly entity?: string;
  readonly entityId?: string;
  readonly actorUserId?: string;
  readonly from?: LocalDate;
  readonly to?: LocalDate;
};

export type { Settings, UserRef };
