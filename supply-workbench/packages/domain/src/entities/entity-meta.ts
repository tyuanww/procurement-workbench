import type { EntityId } from '../values/ids.js';

export type { EntityId };

export type IsoInstant = string;

export type EntityMeta<Id extends EntityId = EntityId> = {
  readonly id: Id;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
};
