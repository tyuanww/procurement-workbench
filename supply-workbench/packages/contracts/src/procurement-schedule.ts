import type { ProcurementScheduleView } from '@sw/application';
import { MAX_PROCUREMENT_PHASE_DAYS, PROCUREMENT_SCHEDULE_STAGES } from '@sw/domain';
import { z } from 'zod';
import { LocalDateSchema, OrderLineIdSchema, EntityIdSchema } from './values.js';
import { WorkItemStatusSchema } from './plan-views.js';
import { ProcurementStoreSchema } from './procurement-store.js';
import { nullable, strictObject } from './shape.js';

const day = LocalDateSchema;
const phaseDays = z.number().int().min(0).max(MAX_PROCUREMENT_PHASE_DAYS);
export const ProcurementCycleSchema = strictObject({
  materialsDays: phaseDays,
  productionDays: phaseDays.min(1),
  deliveryDays: phaseDays,
  basis: z.string().trim().min(1).max(500),
});

export const BuildProcurementScheduleRequestSchema = strictObject({
  orderLineId: OrderLineIdSchema,
  store: ProcurementStoreSchema,
  orderOn: day,
  cycle: ProcurementCycleSchema,
});

export const BuildProcurementScheduleResultSchema = strictObject({
  workItemIds: z.array(EntityIdSchema),
  created: z.boolean(),
});

const source = strictObject({ sheetName: z.string(), rowNo: z.number().int().positive() });
const projectSource = source.extend({
  column: z.number().int().positive(),
  range: nullable(strictObject({ startRow: z.number(), endRow: z.number(), startColumn: z.number(), endColumn: z.number() })),
});

export const ProcurementScheduleViewSchema: z.ZodType<ProcurementScheduleView> = strictObject({
  submittedOn: nullable(day),
  releasedOn: nullable(day),
  projectOrderedOn: nullable(day),
  semiFinishedOrderedOn: nullable(day),
  originalTargetOn: nullable(day),
  submissionDays: nullable(z.number().int().positive()),
  releaseDays: nullable(z.number().int().positive()),
  observations: z.array(strictObject({
    field: z.enum(['submittedOn', 'releasedOn', 'projectOrderedOn', 'masterTargetOn', 'projectTargetOn', 'semiFinishedOrderedOn']),
    value: nullable(day),
    raw: z.string(),
    source: z.union([projectSource, source]),
    importBatchId: z.string(),
    committedAt: z.string(),
    committedBy: nullable(z.string()),
  })),
  items: z.array(strictObject({
    id: EntityIdSchema,
    stage: z.enum(PROCUREMENT_SCHEDULE_STAGES),
    plannedStart: day,
    plannedEnd: day,
    status: WorkItemStatusSchema,
    version: z.number().int().nonnegative(),
    ownerName: nullable(z.string()),
    basis: nullable(ProcurementCycleSchema),
  })),
});
