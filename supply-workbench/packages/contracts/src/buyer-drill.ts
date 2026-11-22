import type { BuyerDrillQuery, BuyerDrillView } from '@sw/application';
import { z } from 'zod';
import { LaneSchema } from './enums.js';
import { nullable, optional, strictObject } from './shape.js';
import { EntityIdSchema, LocalDateSchema } from './values.js';

export const BuyerDrillQuerySchema: z.ZodType<BuyerDrillQuery> = z.discriminatedUnion('kind', [
  strictObject({ kind: z.literal('overdue'), buyerId: EntityIdSchema, lane: optional(LaneSchema) }),
  strictObject({ kind: z.literal('unassigned-exceptions') }),
]);

const line = {
  id: z.string(),
  poRaw: nullable(z.string()),
  nameRaw: nullable(z.string()),
};

export const BuyerDrillSchema: z.ZodType<BuyerDrillView> = z.discriminatedUnion('kind', [
  strictObject({ kind: z.literal('overdue'), items: z.array(strictObject({
    ...line, orderLineId: nullable(z.string()), confirmedOn: nullable(LocalDateSchema),
  })) }),
  strictObject({ kind: z.literal('unassigned-exceptions'), items: z.array(strictObject({
    ...line, orderLineId: z.string(), batchId: nullable(z.string()), note: z.string(),
  })) }),
]);

export type { BuyerDrillView };
