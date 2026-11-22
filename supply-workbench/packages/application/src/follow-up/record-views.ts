import type { ExceptionStatus, ExceptionType, FollowUpKind } from '@sw/domain';

export type LatestNote = {
  readonly orderLineId: string;
  readonly text: string;
};

export type LatestNotes = {
  readonly items: readonly LatestNote[];
};

export type FollowUpView = {
  readonly id: string;
  readonly orderLineId: string;
  readonly batchId: string | null;
  readonly kind: FollowUpKind;
  readonly text: string;
  readonly nextFollowUpAt?: string | null;
  readonly partyId: string | null;
  readonly createdBy: string;
};

export type ExceptionView = {
  readonly id: string;
  readonly orderLineId: string;
  readonly batchId: string | null;
  readonly type: ExceptionType;
  readonly note: string;
  readonly status: ExceptionStatus;
  readonly openedBy: string;
  readonly closedBy: string | null;
  readonly closedAt: string | null;
  readonly closeNote: string | null;
};
