import type {
  AddWorkItemDependencyInput,
  ChangeWorkItemStatusInput,
  CreateWorkItemInput,
  DailyPlanQuery,
  DailyPlanView,
  DeliveryScheduleBatch,
  GenerateWorkItemsInput,
  SchedulePlanQuery,
  ScheduleView,
  WorkItemPredecessor,
  UpdateWorkItemInput,
  WorkItemDependencyView,
  WorkItemDetailView,
  WorkItemEventView,
  WorkItemListQuery,
  WorkItemView,
} from '../../application/src/plan/views.js';
import type { ProjectProgressGroup, ProjectProgressQuery, ProjectProgressView } from '../../application/src/plan/progress.js';
import {
  COUNTERPARTY_ROLES,
  DEPENDENCY_KINDS,
  WORK_ITEM_EVENT_KINDS,
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_SOURCES,
  WORK_ITEM_STATUSES,
  WORK_ITEM_SUBJECT_TYPES,
} from '../../domain/src/entities/work-items.js';
import { z } from 'zod';
import { BatchStatusSchema } from './enums.js';
import { BatchFulfillmentSchema } from './fulfillment.js';
import { ProcurementStoreSchema } from './procurement-store.js';
import { nullable, optional, strictObject } from './shape.js';
import { EntityIdSchema, LocalDateSchema, listResponseSchema } from './values.js';

export const WorkItemSubjectTypeSchema = z.enum(WORK_ITEM_SUBJECT_TYPES);
export const WorkItemKindSchema = z.enum(WORK_ITEM_KINDS);
export const WorkItemStatusSchema = z.enum(WORK_ITEM_STATUSES);
export const WorkItemPrioritySchema = z.enum(WORK_ITEM_PRIORITIES);
export const WorkItemSourceSchema = z.enum(WORK_ITEM_SOURCES);
export const CounterpartyRoleSchema = z.enum(COUNTERPARTY_ROLES);
export const WorkItemEventKindSchema = z.enum(WORK_ITEM_EVENT_KINDS);
export const DependencyKindSchema = z.enum(DEPENDENCY_KINDS);

const lineRefSchema = strictObject({
  id: z.string(),
  poRaw: nullable(z.string()),
  nameRaw: nullable(z.string()),
  itemCodeRaw: nullable(z.string()),
  supplierPartyId: nullable(z.string()),
});

const batchRefSchema = strictObject({ id: z.string(), seq: z.number(), orderLineId: z.string() });

export const WorkItemViewSchema: z.ZodType<WorkItemView> = strictObject({
  id: z.string(),
  subjectType: WorkItemSubjectTypeSchema,
  subjectId: nullable(z.string()),
  kind: WorkItemKindSchema,
  title: z.string(),
  ownerUserId: nullable(z.string()),
  ownerName: nullable(z.string()),
  counterpartyPartyId: nullable(z.string()),
  counterpartyRole: nullable(CounterpartyRoleSchema),
  counterpartyName: nullable(z.string()),
  plannedStart: LocalDateSchema,
  plannedEnd: LocalDateSchema,
  status: WorkItemStatusSchema,
  priority: WorkItemPrioritySchema,
  source: WorkItemSourceSchema,
  parentId: nullable(z.string()),
  version: z.number(),
  overdueDays: nullable(z.number()),
  orderLine: nullable(lineRefSchema),
  batch: nullable(batchRefSchema),
  supplierPartyId: nullable(z.string()),
  supplierName: nullable(z.string()),
  factoryPartyId: nullable(z.string()),
  factoryName: nullable(z.string()),
});

const namedParticipant = strictObject({ presence: z.literal('named'), userId: z.string().min(1), name: z.string().min(1) });
const deletedParticipant = strictObject({ presence: z.literal('deleted'), userId: z.string().min(1) });
const unassignedParticipant = strictObject({ presence: z.literal('unassigned') });
const unrecordedParticipant = strictObject({ presence: z.literal('unrecorded') });
const eventActorSchema = z.discriminatedUnion('presence', [namedParticipant, deletedParticipant, unrecordedParticipant]);
const eventOwnerSchema = z.discriminatedUnion('presence', [namedParticipant, deletedParticipant, unassignedParticipant, unrecordedParticipant]);

export const WorkItemEventViewSchema: z.ZodType<WorkItemEventView> = strictObject({
  id: z.string(),
  workItemId: z.string(),
  kind: WorkItemEventKindSchema,
  field: nullable(z.string()),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  actorUserId: z.string(),
  actor: eventActorSchema,
  ownerAtEvent: eventOwnerSchema,
  ownerChange: nullable(strictObject({ before: eventOwnerSchema, after: eventOwnerSchema })),
  note: nullable(z.string()),
  createdAt: z.string(),
});

const workItemDependency = strictObject({
  id: z.string(),
  fromItemId: z.string(),
  toItemId: z.string(),
  kind: DependencyKindSchema,
  createdAt: z.string(),
});

export const WorkItemDependencyViewSchema: z.ZodType<WorkItemDependencyView> = workItemDependency;

const predecessor: z.ZodType<WorkItemPredecessor> = strictObject({
  id: z.string(), title: z.string(), plannedEnd: LocalDateSchema, status: WorkItemStatusSchema,
});

const incomingDependency = workItemDependency.extend({ predecessor: nullable(predecessor) });

export const WorkItemDetailSchema: z.ZodType<WorkItemDetailView> = strictObject({
  item: WorkItemViewSchema,
  events: z.array(WorkItemEventViewSchema),
  dependenciesOut: z.array(WorkItemDependencyViewSchema),
  dependenciesIn: z.array(incomingDependency),
});

export const PlanGroupViewSchema = strictObject({ key: z.string(), label: nullable(z.string()), items: z.array(WorkItemViewSchema) });

export const DailyPlanSchema: z.ZodType<DailyPlanView> = strictObject({
  date: LocalDateSchema,
  asOf: LocalDateSchema,
  total: z.number(),
  overdueCount: z.number(),
  items: z.array(WorkItemViewSchema),
  byOwner: z.array(PlanGroupViewSchema),
  bySupplier: z.array(PlanGroupViewSchema),
  byFactory: z.array(PlanGroupViewSchema),
});

const deliveryParty = strictObject({ id: z.string(), name: nullable(z.string()) });
const deliveryBatch = strictObject({
  id: z.string(), seq: z.number(), orderLineId: z.string(),
  orderName: nullable(z.string()), poRaw: nullable(z.string()), itemCode: nullable(z.string()), oaRef: nullable(z.string()),
  buyer: nullable(deliveryParty), supplier: nullable(deliveryParty), factory: nullable(deliveryParty),
  confirmed: nullable(LocalDateSchema), firstConfirmed: nullable(LocalDateSchema), supplierPromised: nullable(LocalDateSchema),
  required: nullable(LocalDateSchema), receiptDates: z.array(LocalDateSchema), plannedQty: z.number(), status: BatchStatusSchema,
  fulfillment: BatchFulfillmentSchema.pick({ unit: true, receivedQty: true, unshippedQty: true, reviewCount: true }),
}) satisfies z.ZodType<DeliveryScheduleBatch>;

export const ScheduleViewSchema: z.ZodType<ScheduleView> = strictObject({
  from: LocalDateSchema,
  to: LocalDateSchema,
  total: z.number(),
  items: z.array(WorkItemViewSchema),
  dependencyConflicts: z.record(z.string(), z.array(predecessor)),
  deliveryBatches: optional(z.array(deliveryBatch)),
  deliveryTasks: optional(z.array(strictObject({ task: WorkItemViewSchema, dependencies: z.array(predecessor), conflicts: z.array(predecessor) }))),
});

export const WorkItemListResponseSchema = listResponseSchema(WorkItemViewSchema);

const PositiveQuerySchema = z.union([
  z.number().int().positive(),
  z.string().regex(/^\d+$/).transform((text, ctx) => {
    const value = Number(text);
    if (Number.isInteger(value) && value > 0) return value;
    ctx.addIssue({ code: 'custom', message: '不是正整数' });
    return z.NEVER;
  }),
]);

const BooleanQuerySchema = z.union([z.boolean(), z.enum(['true', 'false']).transform((value) => value === 'true')]);

export const CreateWorkItemRequestSchema: z.ZodType<CreateWorkItemInput> = strictObject({
  subjectType: WorkItemSubjectTypeSchema,
  subjectId: optional(nullable(EntityIdSchema)),
  kind: WorkItemKindSchema,
  title: z.string().min(1),
  ownerUserId: optional(nullable(EntityIdSchema)),
  counterpartyPartyId: optional(nullable(EntityIdSchema)),
  counterpartyRole: optional(nullable(CounterpartyRoleSchema)),
  plannedStart: LocalDateSchema,
  plannedEnd: LocalDateSchema,
  priority: optional(WorkItemPrioritySchema),
  parentId: optional(nullable(EntityIdSchema)),
});

export const UpdateWorkItemRequestSchema: z.ZodType<Omit<UpdateWorkItemInput, 'workItemId'>> = strictObject({
  expectedVersion: optional(z.number().int().nonnegative()),
  title: optional(z.string().min(1)),
  ownerUserId: optional(nullable(EntityIdSchema)),
  counterpartyPartyId: optional(nullable(EntityIdSchema)),
  counterpartyRole: optional(nullable(CounterpartyRoleSchema)),
  plannedStart: optional(LocalDateSchema),
  plannedEnd: optional(LocalDateSchema),
  priority: optional(WorkItemPrioritySchema),
});

export const ChangeWorkItemStatusRequestSchema: z.ZodType<Omit<ChangeWorkItemStatusInput, 'workItemId'>> = strictObject({
  status: WorkItemStatusSchema,
  note: optional(z.string()),
});

export const AddWorkItemDependencyRequestSchema: z.ZodType<AddWorkItemDependencyInput> = strictObject({
  fromItemId: EntityIdSchema,
  toItemId: EntityIdSchema,
});

export const GenerateWorkItemsRequestSchema: z.ZodType<GenerateWorkItemsInput> = strictObject({
  batchIds: optional(z.array(EntityIdSchema)),
  orderLineIds: optional(z.array(EntityIdSchema)),
});

export const DailyPlanQuerySchema: z.ZodType<DailyPlanQuery> = strictObject({
  date: LocalDateSchema,
  ownerUserId: optional(z.string()),
  supplierPartyId: optional(z.string()),
  factoryPartyId: optional(z.string()),
});

const schedulePlanQuery = strictObject({
  store: optional(ProcurementStoreSchema),
  from: LocalDateSchema,
  to: LocalDateSchema,
  ownerUserId: optional(z.string()),
  supplierPartyId: optional(z.string()),
  factoryPartyId: optional(z.string()),
});

export const SchedulePlanQuerySchema: z.ZodType<SchedulePlanQuery> = schedulePlanQuery.extend({
  includeClosed: optional(BooleanQuerySchema), includeDelivery: optional(BooleanQuerySchema),
});

export type { DeliveryScheduleBatch, DeliveryScheduleTask } from '../../application/src/plan/views.js';
export const ProjectProgressQuerySchema: z.ZodType<ProjectProgressQuery> = schedulePlanQuery.extend({ includeItems: optional(BooleanQuerySchema) });

export const WorkItemListQuerySchema: z.ZodType<WorkItemListQuery> = strictObject({
  status: optional(z.array(WorkItemStatusSchema)),
  ownerUserId: optional(z.string()),
  counterpartyPartyId: optional(z.string()),
  subjectType: optional(WorkItemSubjectTypeSchema),
  subjectId: optional(z.string()),
  from: optional(LocalDateSchema),
  to: optional(LocalDateSchema),
  includeClosed: optional(BooleanQuerySchema),
  page: optional(PositiveQuerySchema),
  pageSize: optional(PositiveQuerySchema),
  sort: optional(z.string()),
});

export const WorkItemIdResponseSchema = strictObject({ workItemId: z.string() });
export const WorkItemVersionResponseSchema = strictObject({ workItemId: z.string(), version: z.number() });
export const WorkItemDependencyResponseSchema = strictObject({ dependencyId: z.string(), created: z.boolean() });
export const GenerateWorkItemsResultSchema = strictObject({ created: z.number(), skipped: z.number() });

export type CreateWorkItemRequest = z.output<typeof CreateWorkItemRequestSchema>;
export type UpdateWorkItemRequest = z.output<typeof UpdateWorkItemRequestSchema>;
export type ChangeWorkItemStatusRequest = z.output<typeof ChangeWorkItemStatusRequestSchema>;
export type AddWorkItemDependencyRequest = z.output<typeof AddWorkItemDependencyRequestSchema>;
export type GenerateWorkItemsRequest = z.output<typeof GenerateWorkItemsRequestSchema>;
export type DailyPlanQueryRequest = z.output<typeof DailyPlanQuerySchema>;
export type SchedulePlanQueryRequest = z.output<typeof SchedulePlanQuerySchema>;
export type WorkItemListQueryRequest = z.output<typeof WorkItemListQuerySchema>;

const ProjectProgressGroupSchema: z.ZodType<ProjectProgressGroup> = strictObject({
  key: z.string(),
  label: z.string(),
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  completionRate: z.union([z.number().min(0).max(1), z.null()]),
  itemIds: optional(z.array(z.string())),
});

export type ProjectProgressGroupView = ProjectProgressGroup;
export type ProjectProgress = ProjectProgressView;

export const ProjectProgressSchema: z.ZodType<ProjectProgressView> = strictObject({
  from: LocalDateSchema,
  to: LocalDateSchema,
  total: z.number().int().nonnegative(),
  done: z.number().int().nonnegative(),
  overdue: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  completionRate: z.union([z.number().min(0).max(1), z.null()]),
  byOwner: z.array(ProjectProgressGroupSchema),
  bySupplier: z.array(ProjectProgressGroupSchema),
  byFactory: z.array(ProjectProgressGroupSchema),
  details: optional(strictObject({ asOf: LocalDateSchema, tasks: z.array(strictObject({ item: WorkItemViewSchema, overdue: z.boolean() })) })),
});

export type { WorkItemPredecessor };
