import type { BatchStatus, WaitingOnKind } from '@sw/domain';
import type { TodoRow } from './group.js';

export type BoardItem = TodoRow & {
  readonly poRaw: string | null;
  readonly productName: string | null;
  readonly isUnassigned?: boolean;
  readonly qty: number | null;
  readonly batchStatus: BatchStatus | null;
  readonly waitingKind?: WaitingOnKind;
  readonly inTransit?: { readonly qty: number; readonly unit: string };
  readonly latestFollowUp?: string;
  readonly latestPromise?: string;
  readonly nextFollowUpAt?: string;
  readonly nextFollowUpTarget?: string;
};

export type GroupMode = 'kanban' | 'priority' | 'waiting' | 'reason' | 'date' | 'schedule' | 'owner' | 'supplier';

export type QuickAction = {
  readonly kind: 'receipt' | 'ship' | 'date' | 'note';
  readonly label: string;
};

export type RowFace = {
  readonly reason: string;
  readonly overdue: string;
  readonly overdueTone: 'danger' | 'quiet';
  readonly orderNo: string;
  readonly productName: string;
  readonly isUnassigned?: boolean;
  readonly date: string;
  readonly remaining?: string;
  readonly inTransit?: string;
  readonly waiting?: string;
  readonly waitingKind?: WaitingOnKind;
  readonly latestFollowUp?: string;
  readonly latestPromise?: string;
  readonly nextFollowUpAt?: string;
  readonly nextFollowUpTarget?: string;
};

export type BoardRow = {
  readonly id: string;
  readonly face: RowFace;
  readonly actions: readonly QuickAction[];
};

export type ReasonCount = {
  readonly label: string;
  readonly count: number;
};

export type ReasonChip = {
  readonly code: string;
  readonly label: string;
  readonly count: number;
  readonly isSelected: boolean;
};

export type BoardGroup = {
  readonly key: string;
  readonly name: string;
  readonly counts: readonly ReasonCount[];
  readonly nudgeText: string;
  readonly rows: readonly BoardRow[];
};

export type TodayBoard = {
  readonly group: GroupMode;
  readonly chips: readonly ReasonChip[];
  readonly body:
    | { readonly kind: 'empty'; readonly text: '今天没有需要处理的事。下一步：去跟进中心看看。' }
    | { readonly kind: 'groups'; readonly groups: readonly BoardGroup[]; readonly rows: readonly BoardRow[] };
};
