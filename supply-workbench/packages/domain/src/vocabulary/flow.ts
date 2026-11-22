import { defineEnum } from './define-enum.js';

const batchStatus = defineEnum(
  ['awaiting_date', 'confirmed', 'shipped', 'partially_received', 'received', 'closed', 'cancelled'] as const,
  {
    awaiting_date: '待确认日期',
    confirmed: '已确认',
    shipped: '已发货',
    partially_received: '部分收货',
    received: '已收货',
    closed: '已关闭',
    cancelled: '已取消',
  },
);

const lineStage = defineEnum(
  ['no_batch', 'awaiting_date', 'awaiting_shipment', 'awaiting_receipt', 'partially_received', 'done', 'cancelled'] as const,
  {
    no_batch: '未建要货',
    awaiting_date: '待确认日期',
    awaiting_shipment: '待发货',
    awaiting_receipt: '待收货',
    partially_received: '部分收货',
    done: '已完成（工作台）',
    cancelled: '已取消',
  },
);

const noteStatus = defineEnum(['missing', 'returned', 'verified'] as const, {
  missing: '未回传',
  returned: '已回传',
  verified: '已核对',
});

const todoReason = defineEnum(
  [
    'overdue',
    'demand_before_confirmed',
    'due_today',
    'missing_date',
    'shipped_not_received',
    'note_missing',
    'upcoming',
    'unshipped',
    'fulfillment_review',
    'follow_up_due',
    'follow_up_scheduled',
    'exception_open',
    'review_pending',
    'import_pending',
    'unassigned',
  ] as const,
  {
    overdue: '逾期未到',
    demand_before_confirmed: '需求早于确认',
    due_today: '今日应到',
    missing_date: '缺确认日期',
    shipped_not_received: '已发待收',
    note_missing: '送货单未回',
    upcoming: '即将到期',
    unshipped: '仍待发',
    fulfillment_review: '发收待核',
    follow_up_due: '到时跟进',
    follow_up_scheduled: '已约跟进',
    exception_open: '异常未关闭',
    review_pending: '待审核',
    import_pending: '导入未提交',
    unassigned: '未分配负责人',
  },
);

const waitingOn = defineEnum(['supplier', 'receiver', 'internal'] as const, {
  supplier: '供应商',
  receiver: '收货方',
  internal: '内部',
});

export const BATCH_STATUSES = batchStatus.values;
export const BATCH_STATUS_LABELS = batchStatus.labels;
export const batchStatusLabel = batchStatus.label;
export type BatchStatus = (typeof BATCH_STATUSES)[number];

export const LINE_STAGES = lineStage.values;
export const LINE_STAGE_LABELS = lineStage.labels;
export const lineStageLabel = lineStage.label;
export function lineStageText(code: string): string {
  return lineStage.text(code);
}
export type LineStage = (typeof LINE_STAGES)[number];

export const NOTE_STATUSES = noteStatus.values;
export const NOTE_STATUS_LABELS = noteStatus.labels;
export const noteStatusLabel = noteStatus.label;
export type NoteStatus = (typeof NOTE_STATUSES)[number];

export const TODO_REASONS = todoReason.values;
export const TODO_REASON_LABELS = todoReason.labels;
export const todoReasonLabel = todoReason.label;
export function todoReasonText(code: string): string {
  return todoReason.text(code);
}
export type TodoReason = (typeof TODO_REASONS)[number];

export const WAITING_ON_KINDS = waitingOn.values;
export const WAITING_ON_LABELS = waitingOn.labels;
export const waitingOnLabel = waitingOn.label;
export type WaitingOnKind = (typeof WAITING_ON_KINDS)[number];
