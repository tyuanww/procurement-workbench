import {
  BATCH_STATUSES,
  LINE_STAGES,
  TODO_REASONS,
  batchStatusLabel,
  lineStageLabel,
  todoReasonLabel,
  type BatchStatus,
  type LineStage,
  type TodoReason,
} from '@sw/domain';
import type { statusColor } from '../../theme/tokens.js';

export type StatusKey = TodoReason | LineStage | BatchStatus;

export type StatusTone = keyof typeof statusColor;
export type StatusFill = 'solid' | 'outline';

export type StatusSpec = {
  readonly label: string;
  readonly tone: StatusTone;
  readonly fill: StatusFill;
  readonly icon: string;
  readonly strike: boolean;
};

export const STATUS_SPEC = {
  overdue: { label: todoReasonLabel('overdue'), tone: 'danger', fill: 'solid', icon: 'clock-alert', strike: false },
  demand_before_confirmed: { label: todoReasonLabel('demand_before_confirmed'), tone: 'danger', fill: 'outline', icon: 'arrow-down-alert', strike: false },
  due_today: { label: todoReasonLabel('due_today'), tone: 'warning', fill: 'solid', icon: 'calendar', strike: false },
  missing_date: { label: todoReasonLabel('missing_date'), tone: 'warning', fill: 'outline', icon: 'calendar-question', strike: false },
  shipped_not_received: { label: todoReasonLabel('shipped_not_received'), tone: 'info', fill: 'solid', icon: 'truck', strike: false },
  note_missing: { label: todoReasonLabel('note_missing'), tone: 'neutral', fill: 'solid', icon: 'file', strike: false },
  upcoming: { label: todoReasonLabel('upcoming'), tone: 'neutral', fill: 'outline', icon: 'calendar', strike: false },
  unshipped: { label: todoReasonLabel('unshipped'), tone: 'neutral', fill: 'outline', icon: 'truck', strike: false },
  fulfillment_review: { label: todoReasonLabel('fulfillment_review'), tone: 'warning', fill: 'outline', icon: 'question', strike: false },
  exception_open: { label: todoReasonLabel('exception_open'), tone: 'attention', fill: 'solid', icon: 'triangle-alert', strike: false },
  review_pending: { label: todoReasonLabel('review_pending'), tone: 'warning', fill: 'outline', icon: 'question', strike: false },
  import_pending: { label: todoReasonLabel('import_pending'), tone: 'neutral', fill: 'outline', icon: 'file', strike: false },
  unassigned: { label: todoReasonLabel('unassigned'), tone: 'neutral', fill: 'outline', icon: 'user', strike: false },
  no_batch: { label: lineStageLabel('no_batch'), tone: 'neutral', fill: 'outline', icon: 'dashed', strike: false },
  awaiting_date: { label: lineStageLabel('awaiting_date'), tone: 'warning', fill: 'outline', icon: 'calendar-question', strike: false },
  awaiting_shipment: { label: lineStageLabel('awaiting_shipment'), tone: 'info', fill: 'outline', icon: 'truck', strike: false },
  awaiting_receipt: { label: lineStageLabel('awaiting_receipt'), tone: 'info', fill: 'outline', icon: 'container', strike: false },
  partially_received: { label: lineStageLabel('partially_received'), tone: 'info', fill: 'solid', icon: 'box-half', strike: false },
  done: { label: lineStageLabel('done'), tone: 'success', fill: 'outline', icon: 'check', strike: false },
  cancelled: { label: lineStageLabel('cancelled'), tone: 'neutral', fill: 'solid', icon: 'slash-circle', strike: true },
  confirmed: { label: batchStatusLabel('confirmed'), tone: 'info', fill: 'outline', icon: 'calendar-check', strike: false },
  shipped: { label: batchStatusLabel('shipped'), tone: 'info', fill: 'solid', icon: 'truck', strike: false },
  received: { label: batchStatusLabel('received'), tone: 'success', fill: 'solid', icon: 'check', strike: false },
  closed: { label: batchStatusLabel('closed'), tone: 'neutral', fill: 'solid', icon: 'lock', strike: false },
} satisfies Record<StatusKey, StatusSpec>;

export const STATUS_KEYS: readonly StatusKey[] = [
  ...TODO_REASONS,
  ...LINE_STAGES.filter((stage) => !isTodoReason(stage)),
  ...BATCH_STATUSES.filter((status) => !isTodoReason(status) && !isLineStage(status)),
];

export const LEGACY_STATUS_KEYS: Readonly<Record<string, StatusKey>> = {
  required_before_confirmed: 'demand_before_confirmed',
  missing_confirmed: 'missing_date',
  shipped_waiting: 'shipped_not_received',
};

export function isStatusKey(value: string): value is StatusKey {
  return STATUS_KEYS.some((key) => key === value);
}

export function normalizeStatusKey(value: string): StatusKey | null {
  if (isStatusKey(value)) return value;
  const legacy = LEGACY_STATUS_KEYS[value];
  return legacy ?? null;
}

function isTodoReason(value: string): value is TodoReason {
  return TODO_REASONS.some((reason) => reason === value);
}

function isLineStage(value: string): value is LineStage {
  return LINE_STAGES.some((stage) => stage === value);
}
