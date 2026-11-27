import type {
  BatchOrigin, BatchStatus,
  DateChangeField,
  ExceptionStatus, ExceptionType,
  FollowUpKind,
  DeliveryBatchId,
  EntityId,
  Lane,
  LineOrigin,
  LineStage,
  LocalDate,
  LatestImportPresence,
  OrderLineId,
  NoteStatus,
  PoFormat,
  Provenanced,
  ReceiptCategory,
  ReceiptSource,
  ShipmentSource,
} from '@sw/domain';
import type { BatchFulfillment, ReceiptEvidence, ReceiptEvidenceInput, ShipmentEvidence, ShipmentEvidenceInput } from '@sw/domain';
import type { StoreProgressLine } from './store-progress.js';
import type { ProcurementLineDetail } from '../ports/procurement-repository.js';
import type { PartyRef, UserRef } from '../shared/refs.js';
import type { ExceptionView, FollowUpView } from './record-views.js';
import type { FactoryReportOf, ItemCodeView } from '../master-data/index.js';

export type { BuyerFilter, LineSummary, LinesQuery } from './line-query.js';

export type OrderLineRow = {
  readonly id: string;
  readonly lane: Lane;
  readonly storeProgress?: StoreProgressLine;
  readonly po: { readonly id: string; readonly poRaw: string | null; readonly poFormat: PoFormat };
  readonly nameRaw: string | null;
  readonly itemCodeRaw: string | null;
  readonly barcodeRaw: string | null;
  readonly supplier: PartyRef;
  /** 当前代工厂；以订单行关联为准，自动未匹配或无记录时取活动工厂上报。 */
  readonly factory?: { readonly id: string; readonly displayName: string | null } | null;
  readonly receiver: { readonly id: string | null; readonly displayName: string | null } | null;
  readonly qtyOrdered: number | null;
  readonly receivedQty: number | null;
  readonly factoryDeliveredQty: Provenanced<number>;
  readonly stage: LineStage;
  readonly nextDue: { readonly batchId: string; readonly dateBuyerConfirmed: LocalDate | null; readonly overdueDays: number | null; readonly dateFactoryRequired: LocalDate | null } | null;
  readonly daysInStage: number;
  readonly buyer: UserRef | null;
  readonly statusReported: string | null;
  readonly missingInLatestImport: boolean;
  readonly latestImportPresence?: LatestImportPresence;
  readonly openExceptionCount: number;
  readonly origin: LineOrigin;
};

export type BatchView = {
  readonly id: string;
  readonly orderLineId: string;
  readonly seq: number;
  readonly plannedQty: number;
  readonly receiverPartyId: string;
  readonly dateFactoryRequired: LocalDate | null;
  readonly dateSupplierPromised: LocalDate | null;
  readonly dateBuyerConfirmed: LocalDate | null;
  readonly firstConfirmedDate: LocalDate | null;
  readonly confirmedBy: string | null;
  readonly confirmedAt: string | null;
  readonly status: BatchStatus;
  readonly statusChangedAt: string;
  readonly origin: BatchOrigin;
  readonly originRef: { readonly rowId: string; readonly slotIndex: number } | null;
  readonly closedAt: string | null;
  readonly closedReason: string | null;
  readonly cancelledAt: string | null;
  readonly cancelReason: string | null;
  readonly shipments: readonly ShipmentView[];
  readonly receipts: readonly ReceiptView[];
  readonly deliveryNote: DeliveryNoteView | null;
  readonly fulfillment?: BatchFulfillment;
  readonly shippedQty: number | null;
  readonly receivedQty: number | null;
  readonly qtyVariance: number | null;
  readonly noteStatus: NoteStatus;
  readonly overdueDays: number | null;
  readonly daysInStage: number;
  readonly dateChanges: readonly DateChangeView[];
};

export type ShipmentView = {
  readonly id: string;
  readonly batchId: string;
  readonly qty: number;
  readonly shippedOn: LocalDate;
  readonly source: ShipmentSource;
  readonly fulfillment?: ShipmentEvidence | null;
  readonly recordedAt?: string;
  readonly factoryShipmentRowId: string | null;
  readonly note: string | null;
  readonly createdBy: string;
  readonly voidedAt: string | null;
  readonly voidedBy: string | null;
  readonly voidReason: string | null;
};

export type ReceiptView = {
  readonly id: string;
  readonly batchId: string;
  readonly qty: number;
  readonly receivedOn: LocalDate;
  readonly category: ReceiptCategory;
  readonly source: ReceiptSource;
  readonly fulfillment?: ReceiptEvidence | null;
  readonly recordedAt?: string;
  readonly note: string | null;
  readonly createdBy: string;
  readonly voidedAt: string | null;
  readonly voidedBy: string | null;
  readonly voidReason: string | null;
};

export type DeliveryNoteView = {
  readonly id: string;
  readonly batchId: string;
  readonly status: Exclude<NoteStatus, 'missing'>;
  readonly returnedOn: LocalDate | null;
  readonly verifiedOn: LocalDate | null;
  readonly fileId: string | null;
  readonly note: string | null;
  readonly createdBy: string;
  readonly voidedAt: string | null;
  readonly voidedBy: string | null;
  readonly voidReason: string | null;
};

export type DateChangeView = {
  readonly id: string;
  readonly batchId: string;
  readonly field: DateChangeField;
  readonly oldValue: LocalDate | null;
  readonly newValue: LocalDate | null;
  readonly reason: string | null;
  readonly changedBy: string;
  readonly changedAt: string;
};

export type OrderLineDetail = {
  readonly ownerUndo?: { readonly expectedAssignmentId: EntityId; readonly previousBuyer: UserRef | null };
  readonly pendingBuyerName?: string;
  readonly line: OrderLineRow & {
    readonly unit: string | null;
    readonly purchaseOrderId: string;
    readonly itemId: string | null;
    readonly cancelledAt: string | null;
    readonly cancelReason: string | null;
  };
  readonly po: { readonly id: string; readonly poRaw: string | null; readonly poFormat: PoFormat; readonly relatedPoRaws: readonly string[] };
  readonly codes: readonly ItemCodeView[];
  readonly snapshot: { readonly importBatchId: string; readonly at: string; readonly fields: Readonly<Record<string, Provenanced<unknown>>> } | null;
  readonly batches: readonly BatchView[];
  readonly sourceFiles?: Readonly<Record<string, string>>;
  readonly archivedShipmentSources?: readonly FactoryReportOf<'shipment'>[];
  readonly factoryReports: {
    readonly inTransit: readonly FactoryReportOf<'in_transit'>[];
    readonly shipments: readonly FactoryReportOf<'shipment'>[];
    readonly stock: readonly FactoryReportOf<'stock'>[];
    readonly schedule: readonly FactoryReportOf<'schedule'>[];
    readonly demand: readonly FactoryReportOf<'demand'>[];
    readonly packagingCombo: readonly FactoryReportOf<'packaging_combo'>[];
  };
  readonly exceptions: readonly ExceptionView[];
  readonly followUps: readonly FollowUpView[];
  readonly procurement?: ProcurementLineDetail;
  readonly procurementSchedule?: import('../ports/procurement-schedule.js').ProcurementScheduleView;
};

export type TimelineEvent = {
  readonly id: string;
  readonly at: string;
  readonly actor: UserRef | null;
  readonly voided: boolean;
} & (
  | { readonly kind: 'date_change'; readonly field: DateChangeField; readonly oldValue: LocalDate | null; readonly newValue: LocalDate | null; readonly reason: string | null }
  | { readonly kind: 'shipment'; readonly qty: number; readonly shippedOn: LocalDate; readonly fulfillment?: ShipmentEvidence | null }
  | { readonly kind: 'receipt'; readonly qty: number; readonly receivedOn: LocalDate; readonly fulfillment?: ReceiptEvidence | null }
  | { readonly kind: 'delivery_note'; readonly status: Exclude<NoteStatus, 'missing'> }
  | { readonly kind: 'status_change'; readonly status: BatchStatus }
  | { readonly kind: 'follow_up'; readonly followUpKind: FollowUpKind; readonly text: string; readonly batchId: string | null; readonly nextFollowUpAt?: string | null }
  | { readonly kind: 'exception'; readonly exceptionType: ExceptionType; readonly note: string; readonly status: ExceptionStatus; readonly batchId: string | null }
);

export type LineTimeline = {
  readonly events: readonly TimelineEvent[];
  readonly nextCursor: string | null;
};

export type CreateLineInput = {
  readonly lane: Lane;
  readonly poRaw?: string;
  readonly supplierPartyId?: EntityId;
  readonly itemCodeRaw?: string;
  readonly barcodeRaw?: string;
  readonly nameRaw: string;
  readonly qtyOrdered: number;
  readonly unit?: string;
  readonly receiverPartyId: EntityId;
  readonly buyerUserId?: EntityId;
};

export type UpdateLineInput = {
  readonly lineId: OrderLineId;
  readonly expectedOwnerAssignmentId?: EntityId;
  readonly buyerUserId?: EntityId | null;
  readonly receiverPartyId?: EntityId | null;
  readonly nameRaw?: string;
  readonly qtyOrdered?: number;
  readonly unit?: string | null;
};

export type ReasonInput = { readonly lineId: OrderLineId; readonly reason: string };
export type AssignLinesInput = { readonly lineIds: readonly OrderLineId[]; readonly buyerUserId: EntityId | null };
export type HintBatchesInput = { readonly lineIds: readonly OrderLineId[]; readonly includeCompleted: boolean; readonly source?: 'today' };
export type LineIdInput = { readonly lineId: OrderLineId };
export type TimelineQuery = { readonly lineId: OrderLineId; readonly cursor?: string };

export type CreateBatchInput = LineIdInput & {
  readonly firstBatchOnly?: boolean;
  readonly plannedQty: number;
  readonly receiverPartyId: EntityId;
  readonly dateBuyerConfirmed?: LocalDate;
  readonly dateSupplierPromised?: LocalDate;
  readonly dateFactoryRequired?: LocalDate;
};

export type UpdateBatchInput = {
  readonly batchId: DeliveryBatchId;
  readonly plannedQty?: number;
  readonly plannedUnit?: string;
  readonly receiverPartyId?: EntityId;
  readonly dateBuyerConfirmed?: LocalDate | null;
  readonly dateSupplierPromised?: LocalDate | null;
  readonly dateFactoryRequired?: LocalDate | null;
  readonly reason?: string;
};

export type BatchReasonInput = { readonly batchId: DeliveryBatchId; readonly reason: string };
export type BatchIdInput = { readonly batchId: DeliveryBatchId };
export type RecordShipmentInput = { readonly batchId: DeliveryBatchId; readonly qty: number; readonly shippedOn: LocalDate; readonly note?: string; readonly fulfillment?: ShipmentEvidenceInput };
export type RecordReceiptInput = {
  readonly batchId: DeliveryBatchId;
  readonly qty: number;
  readonly receivedOn: LocalDate;
  readonly category: ReceiptCategory;
  readonly note?: string;
  readonly fulfillment?: ReceiptEvidenceInput;
  readonly attemptReceiptId?: EntityId;
};
export type RecordDeliveryNoteInput = {
  readonly batchId: DeliveryBatchId;
  readonly status: Exclude<NoteStatus, 'missing'>;
  readonly date: LocalDate;
  readonly note?: string;
  readonly file?: { readonly bytes: Uint8Array; readonly fileName: string; readonly mime: string };
};
export type UndoRecordInput = {
  readonly kind: 'shipment' | 'receipt' | 'delivery_note' | 'follow_up' | 'exception';
  readonly recordId: string;
};
export type VoidRecordInput = {
  readonly kind: 'shipment' | 'receipt' | 'delivery_note';
  readonly recordId: string;
  readonly reason: string;
};

export type AddFollowUpInput = {
  readonly orderLineId: OrderLineId;
  readonly batchId?: DeliveryBatchId;
  readonly kind: FollowUpKind;
  readonly text: string;
  readonly nextFollowUpAt?: string | null;
  readonly partyId?: EntityId;
};
export type AddFollowUpsInput = { readonly items: readonly AddFollowUpInput[] };
export type OpenExceptionInput = {
  readonly orderLineId: OrderLineId;
  readonly batchId?: DeliveryBatchId;
  readonly type: ExceptionType;
  readonly note: string;
};
export type CloseExceptionInput = { readonly exceptionId: EntityId; readonly closeNote: string };
export type AdoptFactoryShipmentInput = { readonly rowId: EntityId; readonly batchId: DeliveryBatchId; readonly qty?: number; readonly shippedOn?: LocalDate };
export type GenerateBatchesInput = { readonly rowIds: readonly EntityId[] };
export type CreateLineFromInTransitInput = { readonly rowId: EntityId; readonly buyerUserId?: EntityId };

export type IdResult = { readonly id: string };
export type UpdatedCount = { readonly updated: number };
export type CreatedCount = { readonly created: number };
export type HintBatchResult = { readonly created: number; readonly skipped: readonly { readonly lineId: string; readonly reason: string }[] };
export type GeneratedBatchResult = {
  readonly createdLines: number;
  readonly createdBatches: number;
  readonly skipped: readonly { readonly rowId: string; readonly slotIndex: number; readonly reason: string }[];
};
