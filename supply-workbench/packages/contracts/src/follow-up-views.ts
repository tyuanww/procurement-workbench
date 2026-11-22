import { BatchFulfillmentSchema, ReceiptEvidenceSchema, ShipmentEvidenceSchema } from './fulfillment.js';
import type {
  BatchView,
  DateChangeView,
  DeliveryNoteView,
  ExceptionView,
  FollowUpView,
  HintBatchResult,
  LatestNote,
  LatestNotes,
  LineSummary,
  LineTimeline,
  OrderLineDetail,
  OrderLineRow,
  ReceiptView,
  ShipmentView,
  TimelineEvent,
  UpdatedCount,
} from '@sw/application';
import { z } from 'zod';
import { StoreProgressLineSchema } from './procurement-store.js';
import {
  BatchOriginSchema,
  BatchStatusSchema,
  DateChangeFieldSchema,
  ExceptionStatusSchema,
  ExceptionTypeSchema,
  FollowUpKindSchema,
  LatestImportPresenceSchema,
  LaneSchema,
  LineOriginSchema,
  LineStageSchema,
  NoteStatusSchema,
  PoFormatSchema,
  ReceiptCategorySchema,
  ReceiptSourceSchema,
  RecordedNoteStatusSchema,
  ShipmentSourceSchema,
} from './enums.js';
import { nullable, optional, strictObject } from './shape.js';
import { LocalDateSchema, provenancedSchema } from './values.js';

const partyRef = strictObject({
  id: nullable(z.string()),
  displayName: nullable(z.string()),
  rawName: nullable(z.string()),
});

const userRef = strictObject({ id: z.string(), name: z.string() });

const numberProvenance = provenancedSchema(z.number());

export const OrderLineRowSchema: z.ZodType<OrderLineRow> = strictObject({
  id: z.string(),
  lane: LaneSchema,
  storeProgress: optional(StoreProgressLineSchema),
  po: strictObject({ id: z.string(), poRaw: nullable(z.string()), poFormat: PoFormatSchema }),
  nameRaw: nullable(z.string()),
  itemCodeRaw: nullable(z.string()),
  barcodeRaw: nullable(z.string()),
  supplier: partyRef,
  factory: optional(nullable(strictObject({ id: z.string(), displayName: nullable(z.string()) }))),
  receiver: nullable(strictObject({ id: nullable(z.string()), displayName: nullable(z.string()) })),
  qtyOrdered: nullable(z.number()),
  receivedQty: nullable(z.number()),
  factoryDeliveredQty: numberProvenance,
  stage: LineStageSchema,
  nextDue: nullable(strictObject({
    batchId: z.string(),
    dateBuyerConfirmed: nullable(LocalDateSchema),
    overdueDays: nullable(z.number()),
    dateFactoryRequired: nullable(LocalDateSchema),
  })),
  daysInStage: z.number(),
  buyer: nullable(userRef),
  statusReported: nullable(z.string()),
  missingInLatestImport: z.boolean(),
  latestImportPresence: optional(LatestImportPresenceSchema),
  openExceptionCount: z.number(),
  origin: LineOriginSchema,
});

export const LineSummarySchema: z.ZodType<LineSummary> = strictObject({
  total: z.number(),
  overdue: z.number(),
  dueToday: z.number(),
  missingDate: z.number(),
  stages: z.array(strictObject({ stage: LineStageSchema, count: z.number() })),
});

export const ShipmentViewSchema: z.ZodType<ShipmentView> = strictObject({
  id: z.string(),
  batchId: z.string(),
  qty: z.number(),
  shippedOn: LocalDateSchema,
  source: ShipmentSourceSchema,
  fulfillment: optional(nullable(ShipmentEvidenceSchema)),
  recordedAt: optional(z.string()),
  factoryShipmentRowId: nullable(z.string()),
  note: nullable(z.string()),
  createdBy: z.string(),
  voidedAt: nullable(z.string()),
  voidedBy: nullable(z.string()),
  voidReason: nullable(z.string()),
});

export const ReceiptViewSchema: z.ZodType<ReceiptView> = strictObject({
  id: z.string(),
  batchId: z.string(),
  qty: z.number(),
  receivedOn: LocalDateSchema,
  category: ReceiptCategorySchema,
  source: ReceiptSourceSchema,
  fulfillment: optional(nullable(ReceiptEvidenceSchema)),
  recordedAt: optional(z.string()),
  note: nullable(z.string()),
  createdBy: z.string(),
  voidedAt: nullable(z.string()),
  voidedBy: nullable(z.string()),
  voidReason: nullable(z.string()),
});

export const DeliveryNoteViewSchema: z.ZodType<DeliveryNoteView> = strictObject({
  id: z.string(),
  batchId: z.string(),
  status: RecordedNoteStatusSchema,
  returnedOn: nullable(LocalDateSchema),
  verifiedOn: nullable(LocalDateSchema),
  fileId: nullable(z.string()),
  note: nullable(z.string()),
  createdBy: z.string(),
  voidedAt: nullable(z.string()),
  voidedBy: nullable(z.string()),
  voidReason: nullable(z.string()),
});

export const DateChangeViewSchema: z.ZodType<DateChangeView> = strictObject({
  id: z.string(),
  batchId: z.string(),
  field: DateChangeFieldSchema,
  oldValue: nullable(LocalDateSchema),
  newValue: nullable(LocalDateSchema),
  reason: nullable(z.string()),
  changedBy: z.string(),
  changedAt: z.string(),
});

export const BatchViewSchema: z.ZodType<BatchView> = strictObject({
  id: z.string(),
  orderLineId: z.string(),
  seq: z.number(),
  plannedQty: z.number(),
  receiverPartyId: z.string(),
  dateFactoryRequired: nullable(LocalDateSchema),
  dateSupplierPromised: nullable(LocalDateSchema),
  dateBuyerConfirmed: nullable(LocalDateSchema),
  firstConfirmedDate: nullable(LocalDateSchema),
  confirmedBy: nullable(z.string()),
  confirmedAt: nullable(z.string()),
  status: BatchStatusSchema,
  statusChangedAt: z.string(),
  origin: BatchOriginSchema,
  originRef: nullable(strictObject({ rowId: z.string(), slotIndex: z.number() })),
  closedAt: nullable(z.string()),
  closedReason: nullable(z.string()),
  cancelledAt: nullable(z.string()),
  cancelReason: nullable(z.string()),
  shipments: z.array(ShipmentViewSchema),
  receipts: z.array(ReceiptViewSchema),
  deliveryNote: nullable(DeliveryNoteViewSchema),
  fulfillment: optional(BatchFulfillmentSchema),
  shippedQty: nullable(z.number()),
  receivedQty: nullable(z.number()),
  qtyVariance: nullable(z.number()),
  noteStatus: NoteStatusSchema,
  overdueDays: nullable(z.number()),
  daysInStage: z.number(),
  dateChanges: z.array(DateChangeViewSchema),
});

export const LatestNoteSchema: z.ZodType<LatestNote> = strictObject({
  orderLineId: z.string(),
  text: z.string(),
});

export const LatestNotesSchema: z.ZodType<LatestNotes> = strictObject({
  items: z.array(LatestNoteSchema),
});

export const FollowUpViewSchema: z.ZodType<FollowUpView> = strictObject({
  id: z.string(),
  orderLineId: z.string(),
  batchId: nullable(z.string()),
  kind: FollowUpKindSchema,
  text: z.string(),
  partyId: nullable(z.string()),
  createdBy: z.string(),
});

export const UpdatedCountSchema: z.ZodType<UpdatedCount> = strictObject({
  updated: z.number(),
});

export const HintBatchResultSchema: z.ZodType<HintBatchResult> = strictObject({
  created: z.number(),
  skipped: z.array(strictObject({ lineId: z.string(), reason: z.string() })),
});

export const ExceptionViewSchema: z.ZodType<ExceptionView> = strictObject({
  id: z.string(),
  orderLineId: z.string(),
  batchId: nullable(z.string()),
  type: ExceptionTypeSchema,
  note: z.string(),
  status: ExceptionStatusSchema,
  openedBy: z.string(),
  closedBy: nullable(z.string()),
  closedAt: nullable(z.string()),
  closeNote: nullable(z.string()),
});

export const TimelineEventSchema: z.ZodType<TimelineEvent> = z.discriminatedUnion('kind', [
  strictObject({
    id: z.string(),
    at: z.string(),
    actor: nullable(userRef),
    voided: z.boolean(),
    kind: z.literal('date_change'),
    field: DateChangeFieldSchema,
    oldValue: nullable(LocalDateSchema),
    newValue: nullable(LocalDateSchema),
    reason: nullable(z.string()),
  }),
  strictObject({
    id: z.string(),
    at: z.string(),
    actor: nullable(userRef),
    voided: z.boolean(),
    kind: z.literal('shipment'),
    qty: z.number(),
    shippedOn: LocalDateSchema,
    fulfillment: optional(nullable(ShipmentEvidenceSchema)),
  }),
  strictObject({
    id: z.string(),
    at: z.string(),
    actor: nullable(userRef),
    voided: z.boolean(),
    kind: z.literal('receipt'),
    qty: z.number(),
    receivedOn: LocalDateSchema,
    fulfillment: optional(nullable(ReceiptEvidenceSchema)),
  }),
  strictObject({
    id: z.string(),
    at: z.string(),
    actor: nullable(userRef),
    voided: z.boolean(),
    kind: z.literal('delivery_note'),
    status: RecordedNoteStatusSchema,
  }),
  strictObject({
    id: z.string(),
    at: z.string(),
    actor: nullable(userRef),
    voided: z.boolean(),
    kind: z.literal('status_change'),
    status: BatchStatusSchema,
  }),
  strictObject({
    id: z.string(),
    at: z.string(),
    actor: nullable(userRef),
    voided: z.boolean(),
    kind: z.literal('follow_up'),
    followUpKind: FollowUpKindSchema,
    text: z.string(),
    batchId: nullable(z.string()),
  }),
  strictObject({
    id: z.string(),
    at: z.string(),
    actor: nullable(userRef),
    voided: z.boolean(),
    kind: z.literal('exception'),
    exceptionType: ExceptionTypeSchema,
    note: z.string(),
    status: ExceptionStatusSchema,
    batchId: nullable(z.string()),
  }),
]);

export const LineTimelineSchema: z.ZodType<LineTimeline> = strictObject({
  events: z.array(TimelineEventSchema),
  nextCursor: nullable(z.string()),
});

export type { BatchView, DeliveryNoteView, ExceptionView, FollowUpView, LatestNote, LatestNotes, LineTimeline, OrderLineDetail, OrderLineRow, ReceiptView, ShipmentView, TimelineEvent };

export type { LineSummary };
