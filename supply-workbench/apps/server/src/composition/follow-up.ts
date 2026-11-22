import {
  makeAddFollowUp,
  makeAddFollowUps,
  makeAdoptFactoryShipment,
  makeAssignLines,
  makeArrivalCommands,
  makeArrivalQueries,
  makeCancelBatch,
  makeCancelLine,
  makeCloseBatch,
  makeCloseException,
  makeCreateBatch,
  makeCreateHintBatches,
  makeCreateLine,
  makeDeleteBatch,
  makeExportLines,
  makeExportConfirmedArrivals,
  makeGenerateBatchesFromDemand,
  makeGetBatch,
  makeGetLineDetail,
  makeGetLineTimeline,
  makeListLatestNotes,
  makeListLineOwners,
  makeListLines,
  makeOpenException,
  makeRecordDeliveryNote,
  makeRecordReceipt,
  makeRecordShipment,
  makeReopenBatch,
  makeReopenLine,
  makeUndoRecord,
  makeUpdateBatch,
  makeUpdateLine,
  makeVoidRecord,
} from '@sw/application';
import { spreadsheetWriter } from '@sw/report-renderers';
import {
  aliasRepository,
  arrivalRepository,
  auditRepository,
  bomLineRepository,
  codeLinkRepository,
  confirmedArrivalExportRows,
  createUnitOfWork,
  deliveryBatchRepository,
  exceptionRepository,
  factoryReportRepository,
  fileStore,
  followUpQueries,
  latestNoteQueries,
  followUpRepository,
  importBatchRepository,
  itemCodeRepository,
  itemNameRepository,
  itemRepository,
  orderLineRepository,
  ownerAssignmentRepository,
  partyRepository,
  productContactRepository,
  productImageRepository,
  productRepository,
  purchaseOrderRepository,
  settingsRepository,
  timelineQueries,
  userRepository,
  requireDatabase,
  weeklyReportRepository,
  type AppDatabase,
} from '@sw/persistence';
import { ATTACHMENT_MAX_BYTES, type LocalDate } from '@sw/domain';
import type { FollowUpApi } from '../http/follow-up/api.js';
import { systemClock } from '../system/clock.js';
import { systemIds } from '../system/ids.js';

type Clock = { now(): string; today(): LocalDate };
type Write = { readonly uow: ReturnType<typeof createUnitOfWork>; readonly clock: Clock; readonly ids: ReturnType<typeof systemIds>; readonly files: ReturnType<typeof fileStore> };
type Lines = ReturnType<typeof followUpQueries>;

export function followUpAttachmentMaxBytes(): number {
  return ATTACHMENT_MAX_BYTES;
}

export function register(): never {
  throw new Error('跟进路由由 buildHttpApp 挂载');
}

export function composeFollowUp(input: { readonly db: AppDatabase; readonly uploadDir: string; readonly timeZone: string; readonly clock?: Clock }): FollowUpApi {
  const clock = input.clock ?? systemClock(input.timeZone);
  const write = { uow: createUnitOfWork(input.db, (tx) => stores(tx)), clock, ids: systemIds(), files: fileStore(input.uploadDir) };
  const lines = followUpQueries({ db: input.db, clock, timeZone: input.timeZone });
  return { ...lineApi({ write, lines, db: input.db }), ...batchApi(write, lines), ...noteApi({ write, lines, db: input.db }), arrivals: { ...makeArrivalCommands(write), ...makeArrivalQueries(arrivalRepository(input.db)) } };
}

function lineApi({ write, lines, db }: { readonly write: Write; readonly lines: Lines; readonly db: AppDatabase }): Pick<FollowUpApi, 'createLine' | 'updateLine' | 'cancelLine' | 'reopenLine' | 'assignLines' | 'hintBatches' | 'listLines' | 'listLineOwners' | 'summarizeLines' | 'exportLines' | 'exportConfirmedArrivals' | 'getDetail' | 'timeline'> {
  const reads = { lines };
  return {
    createLine: makeCreateLine(write),
    updateLine: makeUpdateLine(write),
    cancelLine: makeCancelLine(write),
    reopenLine: makeReopenLine(write),
    assignLines: makeAssignLines(write),
    hintBatches: makeCreateHintBatches(write),
    listLines: makeListLines(reads),
    listLineOwners: makeListLineOwners(userRepository(db)),
    summarizeLines: (query) => lines.summary(query),
    exportLines: makeExportLines({ lines, sheets: spreadsheetWriter() }),
    exportConfirmedArrivals: makeExportConfirmedArrivals({ rows: (lineIds) => confirmedArrivalExportRows(db, lineIds), sheets: spreadsheetWriter() }),
    getDetail: makeGetLineDetail(reads),
    timeline: makeGetLineTimeline({ timeline: timelineQueries(db) }),
  };
}

function batchApi(write: Write, lines: Lines): Pick<FollowUpApi, 'createBatch' | 'updateBatch' | 'deleteBatch' | 'closeBatch' | 'cancelBatch' | 'reopenBatch' | 'recordShipment' | 'recordReceipt' | 'getBatch' | 'findBatchId'> {
  const reads = { lines };
  return {
    createBatch: makeCreateBatch(write),
    updateBatch: makeUpdateBatch(write),
    deleteBatch: makeDeleteBatch(write),
    closeBatch: makeCloseBatch(write),
    cancelBatch: makeCancelBatch(write),
    reopenBatch: makeReopenBatch(write),
    recordShipment: makeRecordShipment(write),
    recordReceipt: makeRecordReceipt(write),
    getBatch: makeGetBatch(reads),
    findBatchId: lines.batchIdOf,
  };
}

function noteApi({ write, lines, db }: { readonly write: Write; readonly lines: Lines; readonly db: AppDatabase }): Pick<FollowUpApi, 'deliveryNote' | 'undo' | 'voidRecord' | 'followUp' | 'followUps' | 'latestNotes' | 'openException' | 'closeException' | 'adopt' | 'generateBatches' | 'exceptionLineId'> {
  return {
    deliveryNote: makeRecordDeliveryNote(write),
    undo: makeUndoRecord(write),
    voidRecord: makeVoidRecord(write),
    followUp: makeAddFollowUp(write),
    followUps: makeAddFollowUps(write),
    latestNotes: makeListLatestNotes({ notes: latestNoteQueries(db) }),
    openException: makeOpenException(write),
    closeException: makeCloseException(write),
    adopt: makeAdoptFactoryShipment(write),
    generateBatches: makeGenerateBatchesFromDemand(write),
    exceptionLineId: lines.exceptionLineId,
  };
}

function stores(tx: unknown) {
  const db = requireDatabase(tx);
  return {
    arrivals: arrivalRepository(db),
    users: userRepository(db),
    settings: settingsRepository(db),
    parties: partyRepository(db),
    aliases: aliasRepository(db),
    items: itemRepository(db),
    itemCodes: itemCodeRepository(db),
    itemNames: itemNameRepository(db),
    codeLinks: codeLinkRepository(db),
    purchaseOrders: purchaseOrderRepository(db),
    orderLines: orderLineRepository(db),
    batches: deliveryBatchRepository(db),
    exceptions: exceptionRepository(db),
    followUps: followUpRepository(db),
    factoryReports: factoryReportRepository(db),
    imports: importBatchRepository(db),
    products: productRepository(db),
    productImages: productImageRepository(db),
    productContacts: productContactRepository(db),
    bomLines: bomLineRepository(db),
    weeklyReports: weeklyReportRepository(db),
    audit: auditRepository(db),
    ownerAssignments: ownerAssignmentRepository(db),
  };
}
