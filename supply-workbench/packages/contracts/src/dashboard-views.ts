import type { BuyerLoadDashboard, BuyerLoadRow, StuckDashboard, StuckItem, SupplierDashboard, SupplierKpiRow } from '@sw/application';
import { z } from 'zod';
import { BatchStatusSchema, WaitingOnKindSchema } from './enums.js';
import { KpiFigureSchema } from './master-views.js';
import { nullable, strictObject } from './shape.js';
import { LocalDateSchema } from './values.js';

const namedPerson = strictObject({ id: z.string(), name: nullable(z.string()) });

const buckets = strictObject({
  '0-3': z.number(),
  '4-7': z.number(),
  '8-14': z.number(),
  '15+': z.number(),
});

export const StuckItemSchema: z.ZodType<StuckItem> = strictObject({
  batchId: z.string(),
  stage: BatchStatusSchema,
  daysInStage: z.number(),
  poRaw: nullable(z.string()),
  nameRaw: nullable(z.string()),
  waitingOn: strictObject({
    kind: WaitingOnKindSchema,
    partyId: nullable(z.string()),
    displayName: nullable(z.string()),
  }),
  buyer: nullable(namedPerson),
  dateBuyerConfirmed: nullable(LocalDateSchema),
  factoryLinked: z.boolean(),
  factoryUnlinked: z.boolean(),
  exceptionOpen: z.boolean(),
  supplierAliasPending: z.boolean(),
  bomMissing: z.boolean(),
});

export const StuckDistributionSchema = z.array(strictObject({ stage: BatchStatusSchema, buckets }));

export const StuckDashboardSchema: z.ZodType<StuckDashboard> = strictObject({
  kpis: strictObject({
    openBatches: z.number(),
    overdue: z.number(),
    awaitingDate: z.number(),
    shippedNotReceived: z.number(),
  }),
  distribution: StuckDistributionSchema,
  items: z.array(StuckItemSchema),
});

export const SupplierKpiRowSchema: z.ZodType<SupplierKpiRow> = strictObject({
  partyId: z.string(),
  displayName: nullable(z.string()),
  dueBatches: KpiFigureSchema,
  onTime: KpiFigureSchema,
  averageDelayDays: KpiFigureSchema,
  overdueNow: KpiFigureSchema,
  dateChanges: KpiFigureSchema,
  noteReturnDays: KpiFigureSchema,
  openExceptions: KpiFigureSchema,
  weekly: z.array(strictObject({
    weekStart: LocalDateSchema,
    rate: nullable(z.number()),
    n: z.number(),
  })),
});

export const BuyerLoadRowSchema: z.ZodType<BuyerLoadRow> = strictObject({
  buyer: namedPerson,
  openLines: nullable(z.number()),
  openBatches: z.number(),
  overdue: z.number(),
  dueToday: z.number(),
  missingDate: z.number(),
  openExceptions: nullable(z.number()),
  followUpsInPeriod: nullable(z.number()),
});

export const SupplierDashboardSchema: z.ZodType<SupplierDashboard> = strictObject({
  rows: z.array(SupplierKpiRowSchema),
});

export const BuyerLoadDashboardSchema: z.ZodType<BuyerLoadDashboard> = strictObject({
  rows: z.array(BuyerLoadRowSchema),
  unassignedExceptions: nullable(z.number()),
});

export type { BuyerLoadRow, StuckDashboard, StuckItem, SupplierKpiRow };

const BottleneckCategorySchema = strictObject({
  key: z.enum(['missing_owner', 'missing_factory', 'alias_pending', 'missing_date', 'exception_open', 'aged_15', 'bom_missing', 'factory_demand_unlinked']),
  label: z.string(),
  count: z.number().int().nonnegative(),
  href: z.string(),
});

export const BottleneckSummarySchema = strictObject({ categories: z.array(BottleneckCategorySchema) });
