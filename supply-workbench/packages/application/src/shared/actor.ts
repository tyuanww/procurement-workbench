import type { EntityId, Role } from '@sw/domain';

export type Actor = {
  readonly id: EntityId;
  readonly name: string;
  readonly roles: readonly Role[];
};
