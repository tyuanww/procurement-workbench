import type { EntityId, LocalDate, OrderLineId, ProcurementCycle, ProcurementScheduleStage, ProcurementStore } from '@sw/domain';
import type { ProcurementCellSource, ProcurementProjectDate, ProcurementSource } from './procurement-preview.js';
import type { WorkItemStatus } from '../../../domain/src/entities/work-items.js';
import type { Actor } from '../shared/actor.js';

export type ProcurementDateField = ProcurementProjectDate['field'] | 'submittedOn' | 'masterTargetOn' | 'semiFinishedOrderedOn';

export type ProcurementDateObservation = {
  readonly field: ProcurementDateField;
  readonly value: LocalDate | null;
  readonly raw: string;
  readonly source: ProcurementSource | ProcurementCellSource;
  readonly importBatchId: string;
  readonly committedAt: string;
  readonly committedBy: string | null;
};

export type ProcurementScheduleDates = {
  readonly submittedOn: LocalDate | null;
  readonly releasedOn: LocalDate | null;
  readonly projectOrderedOn: LocalDate | null;
  readonly semiFinishedOrderedOn: LocalDate | null;
  readonly originalTargetOn: LocalDate | null;
  readonly submissionDays: number | null;
  readonly releaseDays: number | null;
  readonly observations: readonly ProcurementDateObservation[];
};

export type ProcurementScheduleItem = {
  readonly id: EntityId;
  readonly stage: ProcurementScheduleStage;
  readonly plannedStart: LocalDate;
  readonly plannedEnd: LocalDate;
  readonly status: WorkItemStatus;
  readonly version: number;
  readonly ownerName: string | null;
  readonly basis: ProcurementCycle | null;
};

export type ProcurementScheduleView = ProcurementScheduleDates & {
  readonly items: readonly ProcurementScheduleItem[];
};

export type ProcurementScheduleQuery = { readonly orderLineId: OrderLineId; readonly store: ProcurementStore };
export type BuildProcurementScheduleInput = ProcurementScheduleQuery & {
  readonly orderOn: LocalDate;
  readonly cycle: ProcurementCycle;
};

export type BuildProcurementSchedule = (input: BuildProcurementScheduleInput, actor: Actor) => Promise<{
  readonly workItemIds: readonly EntityId[];
  readonly created: boolean;
}>;
