import type { SearchHit, SearchResult, TodayChaseQuery, TodayChaseRow, TodayFactory, TodayPageQuery, TodayPageResponse, TodayPaging, TodayQuery, TodayResponse, TodaySort, TodoItem, TodoItemView } from '@sw/application';
import { z } from 'zod';
import { BatchStatusSchema, LaneSchema, NoteStatusSchema, PoFormatSchema, TodoReasonSchema, WaitingOnKindSchema } from './enums.js';
import { nullable, optional, strictObject } from './shape.js';
import { LocalDateSchema } from './values.js';
import { BatchFulfillmentSchema } from './fulfillment.js';

export const TodoItemSchema: z.ZodType<TodoItem> = strictObject({
  id: z.string(),
  subject: z.enum(['batch', 'exception', 'review', 'import']),
  reasons: z.array(TodoReasonSchema),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  ownerUserId: nullable(z.string()),
  waitingOn: strictObject({ kind: WaitingOnKindSchema, partyId: nullable(z.string()) }),
  dueDate: nullable(LocalDateSchema),
  overdueDays: nullable(z.number()),
  refs: strictObject({
    orderLineId: optional(z.string()),
    batchId: optional(z.string()),
    exceptionId: optional(z.string()),
    importBatchId: optional(z.string()),
  }),
});

const todoLine = strictObject({
  id: z.string(),
  lane: LaneSchema,
  poRaw: nullable(z.string()),
  poFormat: nullable(PoFormatSchema),
  nameRaw: nullable(z.string()),
  itemCodeRaw: nullable(z.string()),
  barcodeRaw: nullable(z.string()),
  buyerName: nullable(z.string()),
});

const todoFollowUp = strictObject({ id: z.string(), text: z.string(), createdAt: z.string() });

export const TodoItemViewSchema: z.ZodType<TodoItemView> = z.intersection(TodoItemSchema, strictObject({
  line: nullable(todoLine),
  batch: nullable(strictObject({
    id: z.string(),
    seq: z.number(),
    plannedQty: z.number(),
    status: BatchStatusSchema,
    noteStatus: NoteStatusSchema,
    dateBuyerConfirmed: nullable(LocalDateSchema),
    firstConfirmedDate: nullable(LocalDateSchema),
    dateFactoryRequired: nullable(LocalDateSchema),
    dateSupplierPromised: nullable(LocalDateSchema),
    shippedQty: nullable(z.number()),
    receivedQty: nullable(z.number()),
    lastShippedOn: nullable(LocalDateSchema),
    fulfillment: optional(BatchFulfillmentSchema),
    latestFollowUp: optional(todoFollowUp),
    latestPromise: optional(todoFollowUp),
    nextFollowUpAt: optional(z.iso.datetime()),
  })),
  waitingOnParty: nullable(strictObject({
    id: nullable(z.string()),
    displayName: nullable(z.string()),
    rawName: nullable(z.string()),
  })),
  exception: nullable(strictObject({ id: z.string(), type: z.string(), note: z.string() })),
}));

const todayResponse = strictObject({
  asOf: LocalDateSchema,
  counts: strictObject({
    overdue: z.number(),
    demand_before_confirmed: z.number(),
    due_today: z.number(),
    missing_date: z.number(),
    shipped_not_received: z.number(),
    note_missing: z.number(),
    upcoming: z.number(),
    unshipped: z.number(),
    fulfillment_review: z.number(),
    follow_up_due: z.number(),
    follow_up_scheduled: z.number(),
    exception_open: z.number(),
    review_pending: z.number(),
    import_pending: z.number(),
    unassigned: z.number(),
  }),
  items: z.array(TodoItemViewSchema),
  pendingBatch: optional(z.array(strictObject({
    orderLineId: z.string(),
    poRaw: nullable(z.string()),
    nameRaw: nullable(z.string()),
    qtyOrdered: nullable(z.number()),
    unit: nullable(z.string()),
    missingFields: z.array(z.enum(['quantity', 'unit', 'receiver'])),
    action: z.enum(['create', 'detail']),
  }))),
  arrivalMemos: z.array(strictObject({
    batchId: z.string(),
    batchSeq: nullable(z.int().positive()),
    line: todoLine,
    warehouse: nullable(z.string()),
    confirmedDate: nullable(LocalDateSchema),
    status: z.enum(['in_transit', 'due_today', 'overdue']),
    inTransitQty: z.number(),
    receivedQty: z.number(),
    unit: z.string(),
  })),
  truncated: z.boolean(),
});

export const TodayResponseSchema: z.ZodType<TodayResponse> = todayResponse;

const todayFactory = strictObject({ id: z.string(), name: z.string() });
export const TodayPageResponseSchema: z.ZodType<TodayPageResponse> = todayResponse.extend({
  paging: strictObject({
    page: z.int().positive(),
    pageSize: z.int().positive(),
    total: z.int().nonnegative(),
    urgent: z.int().nonnegative(),
    reasonCounts: todayResponse.shape.counts,
    units: z.array(z.string()),
    factories: z.array(todayFactory),
    followUpCounts: optional(strictObject({ due: z.int().nonnegative(), scheduled: z.int().nonnegative() })),
    chaseCounts: optional(strictObject({ all: z.int().nonnegative(), filtered: z.int().nonnegative() })),
    chaseItemIds: optional(z.array(z.string())),
  }),
});

const todaySort: z.ZodType<TodaySort> = z.discriminatedUnion('kind', [
  strictObject({ kind: z.literal('urgency') }),
  strictObject({ kind: z.literal('bulk'), unit: z.string().trim().min(1) }),
]);

const todayQuery = strictObject({
  scope: z.enum(['mine', 'all']),
  reasons: optional(z.array(TodoReasonSchema)),
  includePending: optional(z.boolean()),
});

export const TodayQuerySchema: z.ZodType<TodayQuery> = todayQuery;
export const TodayPageQuerySchema: z.ZodType<TodayPageQuery> = todayQuery.extend({
  page: strictObject({
    number: z.coerce.number().int().positive().default(1),
    size: z.coerce.number().int().min(1).max(100).default(50),
  }),
  sort: todaySort,
  focusId: optional(z.string().min(1)),
});

export const TodayChaseQuerySchema: z.ZodType<TodayChaseQuery> = strictObject({
  reasons: todayQuery.shape.reasons,
  sort: todaySort,
  factoryId: optional(z.string().trim().min(1)),
  itemId: optional(z.string().min(1)),
});

export const TodayChaseResponseSchema: z.ZodType<readonly TodayChaseRow[]> = z.array(strictObject({
  id: z.string(),
  dueDate: nullable(LocalDateSchema),
  overdueDays: nullable(z.number()),
  reasons: z.array(TodoReasonSchema),
  factory: todayFactory,
  poRaw: nullable(z.string()),
  nameRaw: nullable(z.string()),
  unshippedQty: z.number().positive(),
  unit: nullable(z.string()),
}));

export const SearchHitSchema: z.ZodType<SearchHit> = z.discriminatedUnion('kind', [
  strictObject({
    kind: z.literal('line'),
    id: z.string(),
    poRaw: nullable(z.string()),
    nameRaw: nullable(z.string()),
    barcodeRaw: nullable(z.string()),
    itemCodeRaw: nullable(z.string()),
  }),
  strictObject({
    kind: z.literal('product'),
    id: z.string(),
    skuName: z.string(),
    barcodeRaw: z.string(),
    filingName: nullable(z.string()),
  }),
  strictObject({ kind: z.literal('party'), id: z.string(), displayName: z.string() }),
]);

export const SearchResultSchema: z.ZodType<SearchResult> = strictObject({
  lines: z.array(strictObject({
    kind: z.literal('line'),
    id: z.string(),
    poRaw: nullable(z.string()),
    nameRaw: nullable(z.string()),
    barcodeRaw: nullable(z.string()),
    itemCodeRaw: nullable(z.string()),
  })),
  products: z.array(strictObject({
    kind: z.literal('product'),
    id: z.string(),
    skuName: z.string(),
    barcodeRaw: z.string(),
    filingName: nullable(z.string()),
  })),
  parties: z.array(strictObject({ kind: z.literal('party'), id: z.string(), displayName: z.string() })),
});

export type { SearchHit, SearchResult, TodayChaseQuery, TodayChaseRow, TodayFactory, TodayPageQuery, TodayPageResponse, TodayPaging, TodayQuery, TodayResponse, TodaySort, TodoItem, TodoItemView };
