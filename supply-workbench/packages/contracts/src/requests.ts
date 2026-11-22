import { ReceiptEvidenceInputSchema, ShipmentEvidenceInputSchema } from './fulfillment.js';
import type { PartyListQuery } from '@sw/application';
import { z } from 'zod';
import { ProcurementStoreSchema } from './procurement-store.js';
import { ExceptionTypeSchema, FollowUpKindSchema, ItemKindSchema, LaneSchema, LineStageSchema, ProductContactRoleSchema, ReceiptCategorySchema, RecordedNoteStatusSchema, RoleSchema, TemplateIdSchema } from './enums.js';
import { nullable, optional, strictObject } from './shape.js';
import { DeliveryBatchIdSchema, EntityIdSchema, LocalDateSchema, OrderLineIdSchema } from './values.js';
import { ImportDecisionsSchema } from './import-views.js';

const positiveQuery = z.union([
  z.number().int().positive(),
  z.string().regex(/^\d+$/).transform((text, ctx) => {
    const value = Number(text);
    if (Number.isInteger(value) && value > 0) return value;
    ctx.addIssue({ code: 'custom', message: '不是正整数' });
    return z.NEVER;
  }),
]);

export const PartyListQuerySchema: z.ZodType<PartyListQuery> = strictObject({
  page: optional(positiveQuery),
  pageSize: optional(positiveQuery),
  q: optional(z.string()),
  role: optional(z.enum(['supplier', 'factory', 'own_warehouse'])),
});

export const DevLoginRequestSchema = strictObject({
  userId: z.string(),
  accessCode: z.string(),
});
export type DevLoginRequest = z.output<typeof DevLoginRequestSchema>;

export const LinesQuerySchema = strictObject({
  store: optional(ProcurementStoreSchema),
  lane: optional(LaneSchema),
  q: optional(z.string()),
  supplierPartyId: optional(z.string()),
  receiverPartyId: optional(z.string()),
  buyer: optional(z.string()),
  stages: optional(z.array(LineStageSchema)),
  statusReported: optional(z.array(z.string())),
  overdueOnly: optional(z.boolean()),
  hasOpenException: optional(z.boolean()),
  missingInLatestImport: optional(z.boolean()),
  confirmedFrom: optional(LocalDateSchema),
  confirmedTo: optional(LocalDateSchema),
  importBatchId: optional(z.string()),
  page: optional(z.number()),
  pageSize: optional(z.number()),
  sort: optional(z.string()),
});
export type LinesQuery = z.output<typeof LinesQuerySchema>;

export const CreateLineRequestSchema = strictObject({
  lane: LaneSchema,
  poRaw: optional(z.string()),
  supplierPartyId: optional(EntityIdSchema),
  itemCodeRaw: optional(z.string()),
  barcodeRaw: optional(z.string()),
  nameRaw: z.string(),
  qtyOrdered: z.number(),
  unit: optional(z.string()),
  receiverPartyId: EntityIdSchema,
  buyerUserId: optional(EntityIdSchema),
});
export type CreateLineRequest = z.output<typeof CreateLineRequestSchema>;

export const UpdateLineRequestSchema = strictObject({
  expectedOwnerAssignmentId: optional(EntityIdSchema),
  buyerUserId: optional(nullable(EntityIdSchema)),
  receiverPartyId: optional(nullable(EntityIdSchema)),
  nameRaw: optional(z.string()),
  qtyOrdered: optional(z.number()),
  unit: optional(nullable(z.string())),
});
export type UpdateLineRequest = z.output<typeof UpdateLineRequestSchema>;

export const ReasonRequestSchema = strictObject({ reason: z.string() });
export type ReasonRequest = z.output<typeof ReasonRequestSchema>;

export const AssignLinesRequestSchema = strictObject({
  lineIds: z.array(OrderLineIdSchema),
  buyerUserId: nullable(EntityIdSchema),
});
export type AssignLinesRequest = z.output<typeof AssignLinesRequestSchema>;

export const HintBatchesRequestSchema = strictObject({
  lineIds: z.array(OrderLineIdSchema),
  includeCompleted: z.boolean(),
  source: optional(z.literal('today')),
});
export type HintBatchesRequest = z.output<typeof HintBatchesRequestSchema>;

export const ExportConfirmedArrivalsRequestSchema = strictObject({
  lineIds: z.array(OrderLineIdSchema).min(1),
});

export const CreateBatchRequestSchema = strictObject({
  firstBatchOnly: optional(z.boolean()),
  plannedQty: z.number(),
  receiverPartyId: EntityIdSchema,
  dateBuyerConfirmed: optional(LocalDateSchema),
  dateSupplierPromised: optional(LocalDateSchema),
  dateFactoryRequired: optional(LocalDateSchema),
});
export type CreateBatchRequest = z.output<typeof CreateBatchRequestSchema>;

export const UpdateBatchRequestSchema = strictObject({
  plannedQty: optional(z.number()),
  plannedUnit: optional(z.string().trim().min(1).max(64)),
  receiverPartyId: optional(EntityIdSchema),
  dateBuyerConfirmed: optional(nullable(LocalDateSchema)),
  dateSupplierPromised: optional(nullable(LocalDateSchema)),
  dateFactoryRequired: optional(nullable(LocalDateSchema)),
  reason: optional(z.string()),
});
export type UpdateBatchRequest = z.output<typeof UpdateBatchRequestSchema>;

export const CreateShipmentRequestSchema = strictObject({
  qty: z.number(),
  shippedOn: LocalDateSchema,
  note: optional(z.string()),
  fulfillment: optional(ShipmentEvidenceInputSchema),
});
export type CreateShipmentRequest = z.output<typeof CreateShipmentRequestSchema>;

export const CreateReceiptRequestSchema = strictObject({
  qty: z.number(),
  receivedOn: LocalDateSchema,
  category: ReceiptCategorySchema,
  note: optional(z.string()),
  fulfillment: optional(ReceiptEvidenceInputSchema),
});
export type CreateReceiptRequest = z.output<typeof CreateReceiptRequestSchema>;

export const DeliveryNoteRequestSchema = strictObject({
  status: RecordedNoteStatusSchema,
  date: LocalDateSchema,
  note: optional(z.string()),
});
export type DeliveryNoteRequest = z.output<typeof DeliveryNoteRequestSchema>;

export const AdoptShipmentRequestSchema = strictObject({
  batchId: DeliveryBatchIdSchema,
  qty: optional(z.number()),
  shippedOn: optional(LocalDateSchema),
});
export type AdoptShipmentRequest = z.output<typeof AdoptShipmentRequestSchema>;

export const GenerateBatchesRequestSchema = strictObject({ rowIds: z.array(EntityIdSchema) });
export type GenerateBatchesRequest = z.output<typeof GenerateBatchesRequestSchema>;

export const CreateFollowUpRequestSchema = strictObject({
  orderLineId: OrderLineIdSchema,
  batchId: optional(DeliveryBatchIdSchema),
  kind: FollowUpKindSchema,
  text: z.string(),
  partyId: optional(EntityIdSchema),
});
export type CreateFollowUpRequest = z.output<typeof CreateFollowUpRequestSchema>;

export const BulkFollowUpRequestSchema = strictObject({
  items: z.array(CreateFollowUpRequestSchema),
});
export type BulkFollowUpRequest = z.output<typeof BulkFollowUpRequestSchema>;

const LATEST_NOTES_LIMIT = 200;

export const LatestNotesRequestSchema = strictObject({
  orderLineIds: z.array(OrderLineIdSchema).max(LATEST_NOTES_LIMIT),
});
export type LatestNotesRequest = z.output<typeof LatestNotesRequestSchema>;

export const CreateExceptionRequestSchema = strictObject({
  orderLineId: OrderLineIdSchema,
  batchId: optional(DeliveryBatchIdSchema),
  type: ExceptionTypeSchema,
  note: z.string(),
});
export type CreateExceptionRequest = z.output<typeof CreateExceptionRequestSchema>;

export const CloseExceptionRequestSchema = strictObject({ closeNote: z.string() });
export type CloseExceptionRequest = z.output<typeof CloseExceptionRequestSchema>;

export const StartImportRequestSchema = strictObject({
  fileId: EntityIdSchema,
  template: TemplateIdSchema,
  factoryPartyId: optional(EntityIdSchema),
});
export type StartImportRequest = z.output<typeof StartImportRequestSchema>;

export const ImportDecisionsRequestSchema = ImportDecisionsSchema;
export type ImportDecisionsRequest = z.output<typeof ImportDecisionsRequestSchema>;

export const ApproveAliasRequestSchema = z.union([
  strictObject({
    partyId: EntityIdSchema,
    createParty: optional(z.never()),
    confirmForbiddenPair: optional(z.boolean()),
  }),
  strictObject({
    createParty: strictObject({
      displayName: z.string(),
      isSupplier: z.boolean(),
      isFactory: z.boolean(),
    }),
    partyId: optional(z.never()),
    confirmForbiddenPair: optional(z.boolean()),
  }),
]);
export type ApproveAliasRequest = z.output<typeof ApproveAliasRequestSchema>;

export const ApproveCodeRequestSchema = z.union([
  strictObject({ itemId: EntityIdSchema, createItem: optional(z.never()) }),
  strictObject({
    createItem: strictObject({ displayName: z.string(), kind: ItemKindSchema }),
    itemId: optional(z.never()),
  }),
]);
export type ApproveCodeRequest = z.output<typeof ApproveCodeRequestSchema>;

export const CreatePartyRequestSchema = strictObject({
  displayName: z.string(),
  isSupplier: z.boolean(),
  isFactory: z.boolean(),
  note: optional(z.string()),
});
export type CreatePartyRequest = z.output<typeof CreatePartyRequestSchema>;

export const UpdatePartyRequestSchema = strictObject({
  displayName: optional(z.string()),
  isSupplier: optional(z.boolean()),
  isFactory: optional(z.boolean()),
  note: optional(z.string()),
});
export type UpdatePartyRequest = z.output<typeof UpdatePartyRequestSchema>;

export const UpdateProductRequestSchema = strictObject({
  filingName: optional(z.string()),
  filingNo: optional(z.string()),
  skuName: optional(z.string()),
  netContent: optional(z.string()),
  casePack: optional(z.string()),
  outerSize: optional(z.string()),
  productLine: optional(z.string()),
});
export type UpdateProductRequest = z.output<typeof UpdateProductRequestSchema>;

export const SetProductContactsRequestSchema = strictObject({
  role: ProductContactRoleSchema,
  people: z.array(strictObject({
    userId: optional(EntityIdSchema),
    nameRaw: optional(z.string()),
    note: optional(z.string()),
  })),
});
export type SetProductContactsRequest = z.output<typeof SetProductContactsRequestSchema>;

export const GenerateWeeklyReportRequestSchema = strictObject({ weekStart: LocalDateSchema });
export type GenerateWeeklyReportRequest = z.output<typeof GenerateWeeklyReportRequestSchema>;

export const ExportWeeklyReportRequestSchema = strictObject({
  format: z.enum(['xlsx', 'pdf', 'png']),
});
export type ExportWeeklyReportRequest = z.output<typeof ExportWeeklyReportRequestSchema>;

export const UpdateSettingsRequestSchema = strictObject({
  upcomingDays: optional(z.number()),
  shippedNotReceivedAlertDays: optional(nullable(z.number())),
  deliveryNoteAlertDays: optional(nullable(z.number())),
  missingDateHintWindowDays: optional(z.number()),
  dateSanityRange: optional(strictObject({ from: LocalDateSchema, to: LocalDateSchema })),
  ownWarehousePartyId: optional(nullable(EntityIdSchema)),
});
export type UpdateSettingsRequest = z.output<typeof UpdateSettingsRequestSchema>;

export const CreateUserRequestSchema = strictObject({
  name: z.string(),
  roles: z.array(RoleSchema),
});
export type CreateUserRequest = z.output<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = strictObject({
  name: optional(z.string()),
  roles: optional(z.array(RoleSchema)),
  active: optional(z.boolean()),
});
export type UpdateUserRequest = z.output<typeof UpdateUserRequestSchema>;
