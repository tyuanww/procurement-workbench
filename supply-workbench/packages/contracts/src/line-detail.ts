import type { OrderLineDetail } from '@sw/application';
import { z } from 'zod';
import {
  BatchViewSchema,
  ExceptionViewSchema,
  FollowUpViewSchema,
  OrderLineRowSchema,
} from './follow-up-views.js';
import { comboPayload, demandPayload, inTransitPayload, schedulePayload, shipmentPayload, stockPayload } from './factory-payloads.js';
import { LinkStatusSchema, PoFormatSchema } from './enums.js';
import { ItemCodeViewSchema } from './master-views.js';
import { ProcurementScheduleViewSchema } from './procurement-schedule.js';
import { procurementFact } from './procurement-preview.js';
import { EntityIdSchema } from './values.js';
import { UserRef } from './refs.js';
import { nullable, optional, strictObject } from './shape.js';
import { provenancedSchema } from './values.js';

const report = <K extends string, P>(kind: K, payload: z.ZodType<P>) => strictObject({
  id: z.string(),
  importBatchId: z.string(),
  factoryPartyId: z.string(),
  sheetName: z.string(),
  rowNo: z.number(),
  fingerprint: z.string(),
  linkedOrderLineId: nullable(z.string()),
  linkStatus: LinkStatusSchema,
  linkReason: nullable(z.string()),
  kind: z.literal(kind),
  payload,
});

export const OrderLineDetailSchema: z.ZodType<OrderLineDetail> = strictObject({
  pendingBuyerName: optional(z.string()),
  ownerUndo: optional(strictObject({ expectedAssignmentId: EntityIdSchema, previousBuyer: nullable(UserRef) })),
  line: z.intersection(OrderLineRowSchema, strictObject({
    unit: nullable(z.string()),
    purchaseOrderId: z.string(),
    itemId: nullable(z.string()),
    cancelledAt: nullable(z.string()),
    cancelReason: nullable(z.string()),
  })),
  po: strictObject({
    id: z.string(),
    poRaw: nullable(z.string()),
    poFormat: PoFormatSchema,
    relatedPoRaws: z.array(z.string()),
  }),
  codes: z.array(ItemCodeViewSchema),
  snapshot: nullable(strictObject({
    importBatchId: z.string(),
    at: z.string(),
    fields: z.record(z.string(), provenancedSchema(z.unknown())),
  })),
  batches: z.array(BatchViewSchema),
  factoryReports: strictObject({
    inTransit: z.array(report('in_transit', inTransitPayload)),
    shipments: z.array(report('shipment', shipmentPayload)),
    stock: z.array(report('stock', stockPayload)),
    schedule: z.array(report('schedule', schedulePayload)),
    demand: z.array(report('demand', demandPayload)),
    packagingCombo: z.array(report('packaging_combo', comboPayload)),
  }),
  exceptions: z.array(ExceptionViewSchema),
  followUps: z.array(FollowUpViewSchema),
  procurementSchedule: optional(ProcurementScheduleViewSchema),
  procurement: optional(strictObject({
    relatedLines: z.array(strictObject({ id: z.string(), nameRaw: nullable(z.string()), codeRaw: nullable(z.string()), poRaw: nullable(z.string()) })),
    sources: z.array(strictObject({ importBatchId: z.string(), fileName: nullable(z.string()), committedAt: nullable(z.string()), finishedLineIds: z.array(z.string()), fact: procurementFact })),
  })),
});
