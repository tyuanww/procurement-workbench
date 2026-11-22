import type { DeliveryBatchId, OrderLineId } from '@sw/contracts';
import type {
  AddFollowUp,
  AddFollowUps,
  AdoptFactoryShipment,
  AssignLines,
  CancelBatch,
  CancelLine,
  CloseBatch,
  CloseException,
  CreateBatch,
  CreateHintBatches,
  CreateLine,
  DeleteBatch,
  ExportLines,
  ExportConfirmedArrivals,
  GenerateBatchesFromDemand,
  GetBatch,
  GetLineDetail,
  GetLineTimeline,
  LineSummary,
  ListLatestNotes,
  ListLineOwners,
  ListLines,
  makeArrivalCommands,
  makeArrivalQueries,
  OpenException,
  RecordDeliveryNote,
  RecordReceipt,
  RecordShipment,
  ReopenBatch,
  ReopenLine,
  UndoRecord,
  UpdateBatch,
  UpdateLine,
  VoidRecord,
} from '@sw/application';

export type FollowUpApi = {
  arrivals: ReturnType<typeof makeArrivalCommands> & ReturnType<typeof makeArrivalQueries>;
  createLine: CreateLine;
  updateLine: UpdateLine;
  cancelLine: CancelLine;
  reopenLine: ReopenLine;
  assignLines: AssignLines;
  hintBatches: CreateHintBatches;
  listLines: ListLines;
  listLineOwners: ListLineOwners;
  summarizeLines: (query: Parameters<ListLines>[0]) => Promise<LineSummary>;
  exportLines: ExportLines;
  exportConfirmedArrivals: ExportConfirmedArrivals;
  getDetail: GetLineDetail;
  timeline: GetLineTimeline;
  createBatch: CreateBatch;
  updateBatch: UpdateBatch;
  deleteBatch: DeleteBatch;
  closeBatch: CloseBatch;
  cancelBatch: CancelBatch;
  reopenBatch: ReopenBatch;
  recordShipment: RecordShipment;
  recordReceipt: RecordReceipt;
  deliveryNote: RecordDeliveryNote;
  undo: UndoRecord;
  voidRecord: VoidRecord;
  getBatch: GetBatch;
  followUp: AddFollowUp;
  followUps: AddFollowUps;
  latestNotes: ListLatestNotes;
  openException: OpenException;
  closeException: CloseException;
  adopt: AdoptFactoryShipment;
  generateBatches: GenerateBatchesFromDemand;
  findBatchId(kind: 'shipment' | 'receipt' | 'delivery_note', recordId: string): Promise<DeliveryBatchId>;
  exceptionLineId(exceptionId: string): Promise<OrderLineId>;
};
