import type { DeliveryBatchId, OrderLineId, ProcurementStore } from '@sw/domain';
import type { Actor } from '../shared/actor.js';
import type { FileBytes, UserRef } from '../shared/refs.js';
import type { Clock } from '../ports/clock.js';
import type { FileStore } from '../ports/file-store.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LatestNoteQueries } from '../ports/latest-note-queries.js';
import type { LineQueries } from '../ports/line-queries.js';
import type { SpreadsheetWriter } from '../ports/spreadsheet-writer.js';
import type { TimelineQueries } from '../ports/timeline-queries.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { ListResult } from '../shared/page.js';
import type {
  AddFollowUpInput,
  AddFollowUpsInput,
  AdoptFactoryShipmentInput,
  AssignLinesInput,
  BatchIdInput,
  BatchReasonInput,
  BatchView,
  CloseExceptionInput,
  CreateBatchInput,
  CreateLineFromInTransitInput,
  CreateLineInput,
  CreatedCount,
  GenerateBatchesInput,
  GeneratedBatchResult,
  HintBatchResult,
  HintBatchesInput,
  LineIdInput,
  LineTimeline,
  LinesQuery,
  OpenExceptionInput,
  OrderLineDetail,
  OrderLineRow,
  ReasonInput,
  RecordDeliveryNoteInput,
  RecordReceiptInput,
  RecordShipmentInput,
  TimelineQuery,
  UndoRecordInput,
  UpdateBatchInput,
  UpdateLineInput,
  UpdatedCount,
  VoidRecordInput,
} from './views.js';
import type { LatestNotes } from './record-views.js';

export type * from './views.js';
export type * from './record-views.js';

type Write = { readonly uow: UnitOfWork; readonly clock: Clock; readonly ids: IdGenerator };
type WriteFile = Write & { readonly files: FileStore };

export type CreateLineDeps = Write;
export type CreateLine = (input: CreateLineInput, actor: Actor) => Promise<{ readonly lineId: OrderLineId }>;
export type UpdateLineDeps = Write;
export type UpdateLine = (input: UpdateLineInput, actor: Actor) => Promise<{ readonly lineId: OrderLineId } & Pick<OrderLineDetail, 'ownerUndo'>>;
export type CancelLineDeps = Write;
export type CancelLine = (input: ReasonInput, actor: Actor) => Promise<{ readonly lineId: OrderLineId }>;
export type ReopenLineDeps = Write;
export type ReopenLine = (input: ReasonInput, actor: Actor) => Promise<{ readonly lineId: OrderLineId }>;
export type AssignLinesDeps = Write;
export type AssignLines = (input: AssignLinesInput, actor: Actor) => Promise<UpdatedCount>;
export type CreateHintBatchesDeps = Write;
export type CreateHintBatches = (input: HintBatchesInput, actor: Actor) => Promise<HintBatchResult>;

export type ListLineOwners = (actor: Actor) => Promise<readonly UserRef[]>;

export type ListLinesDeps = { readonly lines: LineQueries };
export type ListLines = (input: LinesQuery, actor: Actor) => Promise<ListResult<OrderLineRow>>;
export type LineExportInput = { readonly query: LinesQuery; readonly hiddenKeys: readonly string[]; readonly columnKeys: readonly string[] };
export type ExportLinesDeps = { readonly lines: LineQueries; readonly sheets: SpreadsheetWriter };
export type ExportLines = (input: LineExportInput, actor: Actor) => Promise<FileBytes>;
export type ConfirmedArrivalExportRow = {
  readonly id: string;
  readonly po: string | null;
  readonly name: string | null;
  readonly seq: number;
  readonly warehouse: string | null;
  readonly confirmedDate: string | null;
  readonly receiverPartyId: string;
  readonly lineId: string;
};
export type ExportConfirmedArrivals = (input: { readonly lineIds: readonly OrderLineId[] }, actor: Actor) => Promise<FileBytes>;
export type GetLineDetailDeps = { readonly lines: LineQueries };
export type GetLineDetail = (input: LineIdInput & { readonly store?: ProcurementStore }, actor: Actor) => Promise<OrderLineDetail>;
export type GetLineTimelineDeps = { readonly timeline: TimelineQueries };
export type GetLineTimeline = (input: TimelineQuery, actor: Actor) => Promise<LineTimeline>;

export type CreateBatchDeps = Write;
export type CreateBatch = (input: CreateBatchInput, actor: Actor) => Promise<{ readonly batchId: DeliveryBatchId }>;
export type UpdateBatchDeps = Write;
export type UpdateBatch = (input: UpdateBatchInput, actor: Actor) => Promise<{ readonly batchId: DeliveryBatchId }>;
export type DeleteBatchDeps = Write;
export type DeleteBatch = (input: BatchIdInput, actor: Actor) => Promise<void>;
export type CloseBatchDeps = Write;
export type CloseBatch = (input: BatchReasonInput, actor: Actor) => Promise<{ readonly batchId: DeliveryBatchId }>;
export type CancelBatchDeps = Write;
export type CancelBatch = (input: BatchReasonInput, actor: Actor) => Promise<{ readonly batchId: DeliveryBatchId }>;
export type ReopenBatchDeps = Write;
export type ReopenBatch = (input: BatchReasonInput, actor: Actor) => Promise<{ readonly batchId: DeliveryBatchId }>;
export type RecordShipmentDeps = Write;
export type RecordShipment = (input: RecordShipmentInput, actor: Actor) => Promise<{ readonly shipmentId: string }>;
export type RecordReceiptDeps = Write;
export type RecordReceipt = (input: RecordReceiptInput, actor: Actor) => Promise<{ readonly receiptId: string }>;
export type RecordDeliveryNoteDeps = WriteFile;
export type RecordDeliveryNote = (input: RecordDeliveryNoteInput, actor: Actor) => Promise<{ readonly deliveryNoteId: string }>;
export type UndoRecordDeps = Write;
export type UndoRecord = (input: UndoRecordInput, actor: Actor) => Promise<void>;
export type VoidRecordDeps = Write;
export type VoidRecord = (input: VoidRecordInput, actor: Actor) => Promise<{ readonly recordId: string }>;
export type GetBatchDeps = { readonly lines: LineQueries };
export type GetBatch = (input: BatchIdInput, actor: Actor) => Promise<BatchView>;

export type ListLatestNotesDeps = { readonly notes: LatestNoteQueries };
export type ListLatestNotes = (input: { readonly orderLineIds: readonly string[] }, actor: Actor) => Promise<LatestNotes>;

export type AddFollowUpDeps = Write;
export type AddFollowUp = (input: AddFollowUpInput, actor: Actor) => Promise<{ readonly followUpId: string }>;
export type AddFollowUpsDeps = Write;
export type AddFollowUps = (input: AddFollowUpsInput, actor: Actor) => Promise<CreatedCount>;
export type OpenExceptionDeps = Write;
export type OpenException = (input: OpenExceptionInput, actor: Actor) => Promise<{ readonly exceptionId: string }>;
export type CloseExceptionDeps = Write;
export type CloseException = (input: CloseExceptionInput, actor: Actor) => Promise<{ readonly exceptionId: string }>;
export type AdoptFactoryShipmentDeps = Write;
export type AdoptFactoryShipment = (input: AdoptFactoryShipmentInput, actor: Actor) => Promise<{ readonly shipmentId: string }>;
export type GenerateBatchesFromDemandDeps = Write;
export type GenerateBatchesFromDemand = (input: GenerateBatchesInput, actor: Actor) => Promise<GeneratedBatchResult>;
export type CreateLineFromInTransitDeps = Write;
export type CreateLineFromInTransit = (input: CreateLineFromInTransitInput, actor: Actor) => Promise<{ readonly lineId: OrderLineId }>;
