import {
  BATCH_ORIGINS,
  BATCH_STATUSES,
  CHANNEL_MATCHES,
  CODE_TYPES,
  DATE_CHANGE_FIELDS,
  ERROR_CODES,
  EXCEPTION_STATUSES,
  EXCEPTION_TYPES,
  FIELD_SOURCES,
  FOLLOW_UP_KINDS,
  IMAGE_SLOTS,
  IMAGE_SOURCES,
  IMPORT_ACTIONS,
  IMPORT_COVERAGES,
  IMPORT_STATUSES,
  LATEST_IMPORT_PRESENCES,
  ISSUE_CODES,
  ISSUE_SEVERITIES,
  ITEM_KINDS,
  LANES,
  LINE_ORIGINS,
  LINE_STAGES,
  LINK_STATUSES,
  MISSING_REASONS,
  NOTE_STATUSES,
  PERMISSION_ACTIONS,
  PO_FORMATS,
  PRODUCT_CONTACT_ROLES,
  PURCHASE_SCOPES,
  RECEIPT_CATEGORIES,
  RECEIPT_SOURCES,
  REVIEW_STATUSES,
  ROLES,
  SHIPMENT_SOURCES,
  TEMPLATE_IDS,
  TODO_REASONS,
  WAITING_ON_KINDS,
  type BatchOrigin,
  type BatchStatus,
  type ChannelMatch,
  type CodeType,
  type DateChangeField,
  type ErrorCode,
  type ExceptionStatus,
  type ExceptionType,
  type FieldSource,
  type FollowUpKind,
  type ImageSlot,
  type ImageSource,
  type ImportAction,
  type ImportCoverage,
  type ImportStatus,
  type LatestImportPresence,
  type IssueCode,
  type IssueSeverity,
  type ItemKind,
  type Lane,
  type LineOrigin,
  type LineStage,
  type LinkStatus,
  type MissingReason,
  type NoteStatus,
  type PermissionAction,
  type PoFormat,
  type ProductContactRole,
  type PurchaseScope,
  type ReceiptCategory,
  type ReceiptSource,
  type ReviewStatus,
  type Role,
  type ShipmentSource,
  type TemplateId,
  type TodoReason,
  type WaitingOnKind,
} from '@sw/domain';
import { z } from 'zod';

export const RoleSchema: z.ZodType<Role> = z.enum(ROLES);
export const LaneSchema: z.ZodType<Lane> = z.enum(LANES);
export const PoFormatSchema: z.ZodType<PoFormat> = z.enum(PO_FORMATS);
export const CodeTypeSchema: z.ZodType<CodeType> = z.enum(CODE_TYPES);
export const ItemKindSchema: z.ZodType<ItemKind> = z.enum(ITEM_KINDS);
export const BatchStatusSchema: z.ZodType<BatchStatus> = z.enum(BATCH_STATUSES);
export const LineStageSchema: z.ZodType<LineStage> = z.enum(LINE_STAGES);
export const NoteStatusSchema: z.ZodType<NoteStatus> = z.enum(NOTE_STATUSES);
export const TodoReasonSchema: z.ZodType<TodoReason> = z.enum(TODO_REASONS);
export const ExceptionTypeSchema: z.ZodType<ExceptionType> = z.enum(EXCEPTION_TYPES);
export const FollowUpKindSchema: z.ZodType<FollowUpKind> = z.enum(FOLLOW_UP_KINDS);
export const ReceiptCategorySchema: z.ZodType<ReceiptCategory> = z.enum(RECEIPT_CATEGORIES);
export const TemplateIdSchema: z.ZodType<TemplateId> = z.enum(TEMPLATE_IDS);
export const ImportStatusSchema: z.ZodType<ImportStatus> = z.enum(IMPORT_STATUSES);
export const ImportActionSchema: z.ZodType<ImportAction> = z.enum(IMPORT_ACTIONS);
export const ImportCoverageSchema: z.ZodType<ImportCoverage> = z.enum(IMPORT_COVERAGES);
export const LatestImportPresenceSchema: z.ZodType<LatestImportPresence> = z.enum(LATEST_IMPORT_PRESENCES);
export const IssueCodeSchema: z.ZodType<IssueCode> = z.enum(ISSUE_CODES);
export const IssueSeveritySchema: z.ZodType<IssueSeverity> = z.enum(ISSUE_SEVERITIES);
export const ReviewStatusSchema: z.ZodType<ReviewStatus> = z.enum(REVIEW_STATUSES);
export const MissingReasonSchema: z.ZodType<MissingReason> = z.enum(MISSING_REASONS);
export const ProductContactRoleSchema: z.ZodType<ProductContactRole> = z.enum(PRODUCT_CONTACT_ROLES);
export const ChannelMatchSchema: z.ZodType<ChannelMatch> = z.enum(CHANNEL_MATCHES);
export const PurchaseScopeSchema: z.ZodType<PurchaseScope> = z.enum(PURCHASE_SCOPES);
export const PermissionActionSchema: z.ZodType<PermissionAction> = z.enum(PERMISSION_ACTIONS);
export const ErrorCodeSchema: z.ZodType<ErrorCode> = z.enum(ERROR_CODES);

export const LineOriginSchema: z.ZodType<LineOrigin> = z.enum(LINE_ORIGINS);
export const BatchOriginSchema: z.ZodType<BatchOrigin> = z.enum(BATCH_ORIGINS);
export const DateChangeFieldSchema: z.ZodType<DateChangeField> = z.enum(DATE_CHANGE_FIELDS);
export const ShipmentSourceSchema: z.ZodType<ShipmentSource> = z.enum(SHIPMENT_SOURCES);
export const ReceiptSourceSchema: z.ZodType<ReceiptSource> = z.enum(RECEIPT_SOURCES);
export const ExceptionStatusSchema: z.ZodType<ExceptionStatus> = z.enum(EXCEPTION_STATUSES);
export const LinkStatusSchema: z.ZodType<LinkStatus> = z.enum(LINK_STATUSES);
export const FieldSourceSchema: z.ZodType<FieldSource> = z.enum(FIELD_SOURCES);
export const ImageSlotSchema: z.ZodType<ImageSlot> = z.enum(IMAGE_SLOTS);
export const ImageSourceSchema: z.ZodType<ImageSource> = z.enum(IMAGE_SOURCES);
export const WaitingOnKindSchema: z.ZodType<WaitingOnKind> = z.enum(WAITING_ON_KINDS);

export const RecordedNoteStatusSchema: z.ZodType<Exclude<NoteStatus, 'missing'>> = z.enum(NOTE_STATUSES).transform((value, ctx) => {
  if (value === 'missing') {
    ctx.addIssue({ code: 'custom', message: '送货单状态不能是未回传' });
    return z.NEVER;
  }
  return value;
});

export type {
  BatchStatus,
  ChannelMatch,
  CodeType,
  ErrorCode,
  ExceptionType,
  FollowUpKind,
  ImportAction,
  ImportCoverage,
  ImportStatus,
  LatestImportPresence,
  IssueCode,
  IssueSeverity,
  ItemKind,
  Lane,
  LineStage,
  MissingReason,
  NoteStatus,
  PermissionAction,
  PoFormat,
  ProductContactRole,
  PurchaseScope,
  ReceiptCategory,
  ReviewStatus,
  Role,
  TemplateId,
  TodoReason,
};
