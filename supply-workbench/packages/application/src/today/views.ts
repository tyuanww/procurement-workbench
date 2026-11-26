import type { BatchFulfillment, LocalDate, TodoReason, WaitingOnKind } from '@sw/domain';
import type { NoteStatus, BatchStatus } from '@sw/domain';
import type { PoFormat, Lane, LineStage } from '@sw/domain';

export type TodoItem = {
  readonly id: string;
  readonly subject: 'batch' | 'exception' | 'review' | 'import';
  readonly reasons: readonly TodoReason[];
  // 02 第 8.1 节把严重度写成 1 | 2 | 3，不是本文件自定的阈值。
  // eslint-disable-next-line no-magic-numbers
  readonly severity: 1 | 2 | 3;
  readonly ownerUserId: string | null;
  readonly waitingOn: { readonly kind: WaitingOnKind; readonly partyId: string | null };
  readonly dueDate: LocalDate | null;
  readonly overdueDays: number | null;
  readonly refs: {
    readonly orderLineId?: string;
    readonly batchId?: string;
    readonly exceptionId?: string;
    readonly importBatchId?: string;
  };
};

export type TodoLineView = {
  readonly id: string;
  readonly lane: Lane;
  readonly poRaw: string | null;
  readonly poFormat: PoFormat | null;
  readonly nameRaw: string | null;
  readonly itemCodeRaw: string | null;
  readonly barcodeRaw: string | null;
  readonly buyerName: string | null;
};

export type TodoBatchView = {
  readonly id: string;
  readonly seq: number;
  readonly plannedQty: number;
  readonly status: BatchStatus;
  readonly noteStatus: NoteStatus;
  readonly dateBuyerConfirmed: LocalDate | null;
  readonly firstConfirmedDate: LocalDate | null;
  readonly dateFactoryRequired: LocalDate | null;
  readonly dateSupplierPromised: LocalDate | null;
  readonly shippedQty: number | null;
  readonly receivedQty: number | null;
  readonly lastShippedOn: LocalDate | null;
  readonly fulfillment?: BatchFulfillment;
  readonly latestFollowUp?: TodoFollowUp;
  readonly latestPromise?: TodoFollowUp;
  readonly nextFollowUpAt?: string;
};

type TodoFollowUp = { readonly id: string; readonly text: string; readonly createdAt: string };

export type ArrivalMemo = {
  readonly batchId: string;
  readonly batchSeq: number | null;
  readonly line: TodoLineView;
  readonly warehouse: string | null;
  readonly confirmedDate: LocalDate | null;
  readonly status: 'in_transit' | 'due_today' | 'overdue';
  readonly inTransitQty: number;
  readonly receivedQty: number;
  readonly unit: string;
};

export type TodoItemView = TodoItem & {
  readonly line: TodoLineView | null;
  readonly batch: TodoBatchView | null;
  readonly waitingOnParty: { readonly id: string | null; readonly displayName: string | null; readonly rawName: string | null } | null;
  readonly reminderTarget?: { readonly kind: WaitingOnKind; readonly name: string | null };
  readonly exception: { readonly id: string; readonly type: string; readonly note: string } | null;
};

export type TodayResponse = {
  readonly asOf: LocalDate;
  readonly counts: Readonly<Record<TodoReason, number>>;
  readonly items: readonly TodoItemView[];
  readonly pendingBatch?: readonly PendingBatchRow[];
  readonly arrivalMemos: readonly ArrivalMemo[];
  readonly truncated: boolean;
};

export type PendingBatchRow = {
  readonly orderLineId: string;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly qtyOrdered: number | null;
  readonly unit: string | null;
  readonly missingFields: readonly ('quantity' | 'unit' | 'receiver')[];
  readonly action: 'create' | 'detail';
};

export type TodaySort = { readonly kind: 'urgency' } | { readonly kind: 'bulk'; readonly unit: string };
export type TodayFilter = { readonly reasons?: readonly TodoReason[]; readonly sort: TodaySort };
export type TodayWorkFilter = 'factory_chase' | 'internal_note' | 'all_unshipped';
export type TodayInbox = 'today' | 'scheduled' | 'unassigned';
type TodayCalendarQuery = LocalDate | 'today';
type TodayCalendarDay = { readonly date: LocalDate; readonly count: number };
type TodayCalendar = {
  readonly date: LocalDate;
  readonly days: readonly TodayCalendarDay[];
  readonly scheduledDays?: readonly TodayCalendarDay[];
};
type TodayInboxQuery = { readonly inbox?: TodayInbox; readonly calendar?: TodayCalendarQuery };
export type TodayChaseQuery = TodayFilter & TodayInboxQuery & { readonly factoryId?: string; readonly itemId?: string; readonly work?: TodayWorkFilter };
export type TodayQuery = Omit<TodayFilter, 'sort'> & {
  readonly scope: 'mine' | 'all';
  readonly includePending?: boolean;
};
export type TodayPageQuery = TodayQuery & TodayInboxQuery & {
  readonly page: { readonly number: number; readonly size: number };
  readonly calendarFollowUps?: true;
  readonly sort: TodaySort;
  readonly work?: TodayWorkFilter;
  readonly focusId?: string;
};
export type TodayFactory = { readonly id: string; readonly name: string };
export type TodayPaging = {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly urgent: number;
  readonly reasonCounts: TodayResponse['counts'];
  readonly units: readonly string[];
  readonly factories: readonly TodayFactory[];
  readonly followUpCounts?: { readonly due: number; readonly scheduled: number };
  readonly chaseCounts?: { readonly all: number; readonly filtered: number };
  readonly internalNoteCount?: number;
  readonly chaseItemIds?: readonly string[];
  /** 三个工作范围各自分页和筛选前的办件数。同一批次可有今天核收和已约跟进。 */
  readonly inboxCounts?: Readonly<Record<TodayInbox, number>>;
  /** 本人待建首批的订单行数，独立于统一分页的办件。 */
  readonly pendingCount?: number;
  readonly calendar?: TodayCalendar;
  readonly focusInbox?: TodayInbox;
  readonly focusDay?: LocalDate;
  readonly focusWork?: 'all_unshipped';
};
export type TodayPageResponse = TodayResponse & { readonly paging: TodayPaging };
export type PersonalTodayScope = 'pending' | 'scheduled' | 'all';
export type PersonalTodayQuery = {
  readonly scope: PersonalTodayScope;
  readonly page: number;
  readonly pageSize: number;
  readonly focusId?: string;
  readonly calendar?: TodayCalendarQuery;
};
export type PersonalTodayResponse = {
  readonly asOf: LocalDate;
  readonly counts: Readonly<Record<Exclude<PersonalTodayScope, 'all'>, number>>;
  readonly items: readonly TodoItemView[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly calendar?: TodayCalendar;
};
export type TodayChaseRow = Pick<TodoItem, 'id' | 'dueDate' | 'overdueDays' | 'reasons'> & {
  readonly factory: TodayFactory;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly batchSeq?: number;
  readonly unshippedQty: number;
  readonly unit: string | null;
};

/** 02 第 8 节交给 projectTodos 的输入。展示摘要不在这里。 */
export type TodoInput = {
  readonly batches: readonly TodoBatchSource[];
  readonly exceptions: readonly TodoExceptionSource[];
  readonly reviewCounts: { readonly aliases: number; readonly codes: number; readonly links: number; readonly multiName: number };
  readonly uncommittedImports: readonly { readonly id: string; readonly createdBy: string; readonly createdAt: string }[];
};

export type TodoBatchSource = {
  readonly id: string;
  readonly orderLineId: string;
  readonly isLineCancelled: boolean;
  readonly ownerUserId: string | null;
  readonly status: BatchStatus;
  readonly plannedQty: number;
  readonly dateBuyerConfirmed: LocalDate | null;
  readonly dateFactoryRequired: LocalDate | null;
  readonly dateSupplierPromised: LocalDate | null;
  readonly receiverPartyId: string;
  readonly supplierPartyId: string | null;
  readonly overdueDays: number | null;
  readonly noteStatus: NoteStatus;
  readonly shipments: readonly { readonly qty: number; readonly shippedOn: LocalDate }[];
  readonly receipts: readonly { readonly qty: number; readonly receivedOn: LocalDate }[];
  readonly earliestHintDate: LocalDate | null;
  readonly nextFollowUpAt?: string;
  readonly fulfillment: BatchFulfillment;
};

export type TodoExceptionSource = {
  readonly id: string;
  readonly orderLineId: string;
  readonly batchId: string | null;
  readonly type: string;
  readonly note: string;
  readonly openedBy: string;
  readonly lineOwnerUserId?: string | null;
};

export type TodayCatalog = {
  readonly sources: readonly TodoBatchSource[];
  readonly lines: readonly TodoLineView[];
  readonly batches: readonly TodoBatchView[];
  readonly parties: readonly { readonly id: string; readonly displayName: string }[];
};

export type PendingBatchSource = Pick<PendingBatchRow, 'orderLineId' | 'poRaw' | 'nameRaw' | 'qtyOrdered' | 'unit'> & {
  readonly buyerUserId: string;
  readonly receiverPartyId: string | null;
  readonly receiverIsOwnWarehouse: boolean;
  readonly cancelledAt: string | null;
  readonly stage: LineStage;
  readonly reportedStatus: string | null;
};
