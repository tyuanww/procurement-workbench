import type { ManagementDecision, ManagementMeeting, ManagementMeetingSnapshot } from '@sw/application';
import { PROCUREMENT_STORES } from '@sw/domain';
import { z } from 'zod';
import { UserRef } from './refs.js';
import { nullable, strictObject } from './shape.js';
import { EntityIdSchema, LocalDateSchema, OrderLineIdSchema } from './values.js';

export type {
  ManagementDecision, ManagementMeeting, ManagementMeetingSnapshot, ManagementMeetingStore, MeetingMaterial, MeetingWaitingOn,
} from '@sw/application';

const store = z.enum(PROCUREMENT_STORES).exclude(['all']);
export const MANAGEMENT_MEETING_STORES = store.options;
const query = { store, weekStart: LocalDateSchema };
const text = z.string().trim().min(1).max(2000);
const waitingOn = z.enum(['verification', 'buyer', 'supplier', 'receiver', 'none']);
const date = nullable(LocalDateSchema);
const label = nullable(z.string());
const quantity = nullable(z.number());
const promiseText = nullable(strictObject({ text: z.string(), recordedAt: z.string() }));

export const ManagementMeetingQuerySchema = strictObject(query);
export const RecordManagementDecisionSchema = strictObject({
  ...query, materialLineId: OrderLineIdSchema, ownerId: EntityIdSchema,
  decision: text, dueDate: LocalDateSchema, completionCriteria: text,
});
export const CompleteManagementDecisionSchema = strictObject({ evidence: text });

export const ManagementDecisionSchema: z.ZodType<ManagementDecision> = strictObject({
  ...query,
  id: z.string(), materialLineId: z.string(), decision: z.string(), owner: UserRef,
  dueDate: LocalDateSchema, completionCriteria: z.string(), recordedAt: z.string(), decidedBy: UserRef,
  completion: nullable(strictObject({ evidence: z.string(), at: z.string(), by: UserRef })),
});

const meetingPeriod = { ...query, previousWeekStart: LocalDateSchema, weekEnd: LocalDateSchema };
const snapshot = {
  ...meetingPeriod,
  materials: z.array(strictObject({
    materialLineId: z.string(), name: label, code: label, poRef: label, unit: label,
    source: strictObject({ importBatchId: z.string(), sheetName: z.string(), rowNo: z.number().int().positive() }),
    orderedQty: quantity, sourceReportedProgress: label, sourceReportedQty: quantity, sourceReportedGap: quantity,
    verifiedShippedQty: quantity, verifiedReceivedQty: quantity, quantityNeedsReview: z.boolean(),
    waitingOn: z.array(waitingOn), buyerName: label, supplierName: label, receiverName: label,
    affectedFinished: z.array(strictObject({ id: z.string(), name: label, oaRef: label })),
    batches: z.array(strictObject({
      id: z.string(), seq: z.number(), waitingOn: z.array(waitingOn),
      previousPromiseText: promiseText,
      previousPromise: nullable(strictObject({ date: LocalDateSchema, recordedAt: z.string(), source: z.enum(['batch', 'change']) })),
      factoryRequired: date, currentPromise: date, confirmedArrival: date,
    })),
  })),
  development: z.array(strictObject({
    id: z.string(), name: z.string(), projectName: z.string(), plannedEnd: LocalDateSchema,
    destination: z.enum(['factory', 'warehouse']), ownerName: label,
    latestReply: promiseText,
  })),
  decisions: z.array(ManagementDecisionSchema),
};

export const ManagementMeetingSnapshotSchema: z.ZodType<ManagementMeetingSnapshot> = strictObject(snapshot);
export const ManagementMeetingSchema: z.ZodType<ManagementMeeting> = strictObject({ ...snapshot, owners: z.array(UserRef) });
