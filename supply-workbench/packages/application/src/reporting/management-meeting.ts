import { addDays, businessDay, can, PROCUREMENT_STORES, weekStart, type EntityId, type LocalDate, type OrderLineId } from '@sw/domain';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { UnitOfWork, UnitOfWorkStores } from '../ports/unit-of-work.js';
import type { Actor } from '../shared/actor.js';
import { auditOf } from '../shared/audit.js';
import { authorize } from '../shared/authorize.js';
import { NotFoundError, StateConflictError, ValidationFailedError } from '../shared/errors.js';
import type { UserRef } from '../shared/refs.js';

export const MANAGEMENT_MEETING_STORES = PROCUREMENT_STORES.filter((store) => store !== 'all');
const PREVIOUS_MONDAY = -7;
const SUNDAY = 6;
export type ManagementMeetingStore = typeof MANAGEMENT_MEETING_STORES[number];

export type ManagementMeetingQuery = {
  readonly store: ManagementMeetingStore;
  readonly weekStart: LocalDate;
};

export type ManagementMeetingPeriod = ManagementMeetingQuery & {
  readonly weekEnd: LocalDate;
  readonly previousWeekStart: LocalDate;
};

export type MeetingPromiseText = { readonly text: string; readonly recordedAt: string };

export type ManagementMeetingDevelopment = {
  readonly id: string;
  readonly name: string;
  readonly projectName: string;
  readonly plannedEnd: LocalDate;
  readonly destination: 'factory' | 'warehouse';
  readonly ownerName: string | null;
  readonly latestReply: MeetingPromiseText | null;
};

export type MeetingWaitingOn = 'verification' | 'buyer' | 'supplier' | 'receiver' | 'none';

export type MeetingPromise = {
  readonly date: LocalDate;
  readonly recordedAt: string;
  readonly source: 'batch' | 'change';
};

export type MeetingBatch = {
  readonly id: string;
  readonly seq: number;
  readonly previousPromise: MeetingPromise | null;
  readonly previousPromiseText: MeetingPromiseText | null;
  readonly factoryRequired: LocalDate | null;
  readonly currentPromise: LocalDate | null;
  readonly confirmedArrival: LocalDate | null;
  readonly waitingOn: readonly MeetingWaitingOn[];
};

export type MeetingFinishedLine = {
  readonly id: string;
  readonly name: string | null;
  readonly oaRef: string | null;
};

export type MeetingMaterial = {
  readonly materialLineId: string;
  readonly name: string | null;
  readonly code: string | null;
  readonly poRef: string | null;
  readonly orderedQty: number | null;
  readonly unit: string | null;
  readonly source: { readonly importBatchId: string; readonly sheetName: string; readonly rowNo: number };
  readonly sourceReportedProgress: string | null;
  readonly sourceReportedQty: number | null;
  readonly sourceReportedGap: number | null;
  readonly verifiedShippedQty: number | null;
  readonly verifiedReceivedQty: number | null;
  readonly quantityNeedsReview: boolean;
  readonly waitingOn: readonly MeetingWaitingOn[];
  readonly buyerName: string | null;
  readonly supplierName: string | null;
  readonly receiverName: string | null;
  readonly affectedFinished: readonly MeetingFinishedLine[];
  readonly batches: readonly MeetingBatch[];
};

export type MeetingCompletion = { readonly evidence: string; readonly at: string; readonly by: UserRef };
export type ManagementDecision = {
  readonly id: string;
  readonly store: ManagementMeetingStore;
  readonly weekStart: LocalDate;
  readonly materialLineId: string;
  readonly decision: string;
  readonly owner: UserRef;
  readonly dueDate: LocalDate;
  readonly completionCriteria: string;
  readonly recordedAt: string;
  readonly decidedBy: UserRef;
  readonly completion: MeetingCompletion | null;
};

export type ManagementMeetingSnapshot = ManagementMeetingPeriod & {
  readonly materials: readonly MeetingMaterial[];
  readonly development: readonly ManagementMeetingDevelopment[];
  readonly decisions: readonly ManagementDecision[];
};

export type ManagementMeeting = ManagementMeetingSnapshot & {
  readonly owners: readonly UserRef[];
};

export type RecordManagementDecision = ManagementMeetingQuery & {
  readonly materialLineId: OrderLineId;
  readonly decision: string;
  readonly ownerId: EntityId;
  readonly dueDate: LocalDate;
  readonly completionCriteria: string;
};

export type CompleteManagementDecision = {
  readonly id: EntityId;
  readonly evidence: string;
};

export interface ManagementMeetingRepository {
  load(period: ManagementMeetingPeriod): Promise<ManagementMeetingSnapshot>;
  owners(): Promise<readonly UserRef[]>;
  hasMaterial(query: { readonly store: ManagementMeetingStore; readonly materialLineId: string }): Promise<boolean>;
  insert(decision: ManagementDecision): Promise<void>;
  lock(id: string): Promise<ManagementDecision | undefined>;
  complete(id: string, completion: MeetingCompletion): Promise<void>;
}

export type ManagementMeetingStores = UnitOfWorkStores & { readonly managementMeeting: ManagementMeetingRepository };

export function meetingPeriod(query: ManagementMeetingQuery): ManagementMeetingPeriod {
  if (weekStart(query.weekStart) !== query.weekStart) throw new ValidationFailedError('周会日期必须从周一开始');
  return { ...query, previousWeekStart: addDays(query.weekStart, PREVIOUS_MONDAY), weekEnd: addDays(query.weekStart, SUNDAY) };
}

type Dependencies = {
  readonly uow: UnitOfWork<ManagementMeetingStores>;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly timeZone: string;
};

export function makeManagementMeeting(deps: Dependencies) {
  return {
    read: async (query: ManagementMeetingQuery, actor: Actor): Promise<ManagementMeeting> => {
      authorize(actor, 'dashboard.read');
      const period = meetingPeriod(query);
      return deps.uow.run(async ({ managementMeeting }) => ({
        ...await managementMeeting.load(period),
        owners: can(actor, 'reports.generate') ? await managementMeeting.owners() : [],
      }));
    },
    record: (input: RecordManagementDecision, actor: Actor) => recordDecision({ deps, input, actor }),
    complete: (input: CompleteManagementDecision, actor: Actor) => completeDecision({ deps, input, actor }),
  };
}

async function recordDecision({ deps, input, actor }: {
  readonly deps: Dependencies;
  readonly input: RecordManagementDecision;
  readonly actor: Actor;
}): Promise<ManagementDecision> {
  authorize(actor, 'reports.generate');
  const period = meetingPeriod(input);
  const recordedAt = deps.clock.now();
  if (period.weekStart > businessDay(recordedAt, deps.timeZone)) throw new ValidationFailedError('未来周次开始后可以记录决定');
  if (input.dueDate < period.weekStart) throw new ValidationFailedError('截止日须在会议周一或之后');
  return deps.uow.run(async ({ managementMeeting, audit }) => {
    if (!await managementMeeting.hasMaterial(input)) throw new NotFoundError('店铺内采购事项', input.materialLineId);
    const owner = (await managementMeeting.owners()).find((user) => user.id === input.ownerId);
    if (owner === undefined) throw new ValidationFailedError('请选择有效的负责人');
    const decision: ManagementDecision = {
      id: deps.ids.next(), store: input.store, weekStart: input.weekStart, materialLineId: input.materialLineId,
      decision: required(input.decision), owner, dueDate: input.dueDate, completionCriteria: required(input.completionCriteria),
      recordedAt, decidedBy: { id: actor.id, name: actor.name }, completion: null,
    };
    await managementMeeting.insert(decision);
    await audit.record(auditOf({ action: 'report.meetingDecisionRecord', subject: decision, ctx: { actor, at: recordedAt, entity: '周会决定', after: decision } }));
    return decision;
  });
}

async function completeDecision({ deps, input, actor }: {
  readonly deps: Dependencies;
  readonly input: CompleteManagementDecision;
  readonly actor: Actor;
}): Promise<ManagementDecision> {
  authorize(actor, 'reports.generate');
  const completion = { evidence: required(input.evidence), at: deps.clock.now(), by: { id: actor.id, name: actor.name } };
  return deps.uow.run(async ({ managementMeeting, audit }) => {
    const previous = await managementMeeting.lock(input.id);
    if (previous === undefined) throw new NotFoundError('周会决定', input.id);
    if (previous.completion !== null) throw new StateConflictError('decision_completed');
    const decision = { ...previous, completion };
    await managementMeeting.complete(input.id, completion);
    await audit.record(auditOf({ action: 'report.meetingDecisionComplete', subject: decision, ctx: { actor, at: completion.at, entity: '周会决定', before: previous, after: decision } }));
    return decision;
  });
}

function required(text: string): string {
  const value = text.trim();
  if (value === '') throw new ValidationFailedError('请填写决定和依据');
  return value;
}
