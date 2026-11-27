import {
  DEVELOPMENT_DESTINATIONS, DEVELOPMENT_PROJECT_STAGES, PRODUCT_DEVELOPMENT_STORES,
  type DevelopmentFollowUp, type DevelopmentFollowUpInput, type DevelopmentProgress, type DevelopmentProgressFacts,
} from '@sw/domain';
import type {
  CreateDevelopmentNode, CreateDevelopmentProject, DevelopmentMaterialOption, DevelopmentOrderOption, LinkDevelopmentNode,
  ProductDevelopmentView, ReplyToDevelopmentNode, UpdateDevelopmentNode, UpdateDevelopmentProjectProgress,
} from '../../application/src/product-development/index.js';
import { z } from 'zod';
import { BatchStatusSchema } from './enums.js';
import { BatchFulfillmentSchema } from './fulfillment.js';
import { WorkItemStatusSchema } from './plan-views.js';
import { nullable, optional, strictObject } from './shape.js';
import { EntityIdSchema, LocalDateSchema, OrderLineIdSchema } from './values.js';

export const ProductDevelopmentStoreSchema = z.enum(PRODUCT_DEVELOPMENT_STORES);
export const DevelopmentDestinationSchema = z.enum(DEVELOPMENT_DESTINATIONS);
export const DevelopmentProjectStageSchema = z.enum(DEVELOPMENT_PROJECT_STAGES);
const projectFields = { projectId: EntityIdSchema };
const nodeFields = { ...projectFields, nodeId: EntityIdSchema };
const commandId = z.uuid().pipe(EntityIdSchema);
const title = z.string().trim().min(1).max(120);
const evidence = z.string().trim().min(1).max(1000);
const version = z.number().int().nonnegative();
const rawText = (max: number) => z.string().max(max).refine((value) => !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value));
const enteredText = (max: number) => rawText(max).refine((value) => value.trim().length > 0);
const excelCellTextMax = 32_767;
const sourceCell = strictObject({
  address: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/u), label: rawText(255), raw: rawText(excelCellTextMax),
  display: optional(rawText(excelCellTextMax)), formula: optional(rawText(excelCellTextMax)),
});
const progressSource = strictObject({
  fileName: enteredText(255).refine((value) => !value.includes('/') && !value.includes('\\')),
  sheet: enteredText(31), row: z.number().int().min(1).max(1_048_576),
  cells: z.array(sourceCell).min(1).max(40),
}).refine(({ row, cells }) => cells.every(({ address }) => Number(address.replace(/^[A-Z]+/u, '')) === row)
  && new Set(cells.map(({ address }) => address)).size === cells.length
  && cells.reduce((length, { raw, display, formula }) => length + raw.length + (display?.length ?? 0) + (formula?.length ?? 0), 0) <= 65_536,
  '来源单元格须在同一行、不能重复且总内容长度不超过 65536');
const progressDate = strictObject({ raw: enteredText(excelCellTextMax), date: optional(LocalDateSchema) });
const projectProgressFacts = strictObject({
  confirmedStage: nullable(DevelopmentProjectStageSchema),
  currentNote: optional(enteredText(excelCellTextMax)),
  requirement: optional(progressDate), forecast: optional(progressDate), contacts: optional(enteredText(excelCellTextMax)),
}) satisfies z.ZodType<DevelopmentProgressFacts>;
const projectProgressDraft = projectProgressFacts.extend({ source: optional(progressSource) });

const waiting = z.discriminatedUnion('kind', [
  strictObject({ kind: z.literal('unknown') }),
  strictObject({ kind: z.literal('none') }),
  strictObject({ kind: z.literal('waiting'), party: optional(enteredText(120)), deliverable: optional(enteredText(1000)) }),
]);
const followUpInput = strictObject({
  nextAction: optional(enteredText(1000)), managementDecision: optional(enteredText(1000)), waiting, reviewOn: optional(LocalDateSchema),
}) satisfies z.ZodType<DevelopmentFollowUpInput>;
const followUp = followUpInput.extend({ updatedBy: EntityIdSchema, updatedAt: z.iso.datetime() }) satisfies z.ZodType<DevelopmentFollowUp>;
const projectProgressUpdate = projectProgressFacts.extend({ followUp: optional(followUpInput) });
export const DevelopmentProjectProgressSchema = projectProgressDraft.extend({ followUp: optional(followUp) }) satisfies z.ZodType<DevelopmentProgress>;
const assignmentFields = {
  ownerUserId: nullable(EntityIdSchema),
  buyerUserId: nullable(EntityIdSchema),
  plannedStart: LocalDateSchema,
  plannedEnd: LocalDateSchema,
};

export const DevelopmentScopeSchema = strictObject({
  store: z.union([ProductDevelopmentStoreSchema, z.literal('all')]).default('all'),
  includeReceiptDates: optional(z.literal('1')),
});
export const FindDevelopmentOrdersSchema = strictObject({ store: ProductDevelopmentStoreSchema, search: z.string().trim().min(2).max(120) });
export const FindDevelopmentMaterialsSchema = strictObject({ store: ProductDevelopmentStoreSchema, orderLineId: OrderLineIdSchema });

export const CreateDevelopmentProjectSchema = strictObject({
  id: commandId, store: ProductDevelopmentStoreSchema, title, productLeadUserId: EntityIdSchema, progress: optional(projectProgressDraft),
}) satisfies z.ZodType<CreateDevelopmentProject>;

export const UpdateDevelopmentProjectProgressSchema = strictObject({
  ...projectFields, expectedVersion: version, progress: projectProgressUpdate,
}) satisfies z.ZodType<UpdateDevelopmentProjectProgress>;

export const CreateDevelopmentNodeSchema = strictObject({
  id: commandId, ...projectFields, title, destination: DevelopmentDestinationSchema, ...assignmentFields,
}) satisfies z.ZodType<CreateDevelopmentNode>;

export const UpdateDevelopmentNodeSchema = strictObject({
  ...nodeFields, expectedVersion: version, status: WorkItemStatusSchema, ...assignmentFields, followUp: optional(followUpInput),
}) satisfies z.ZodType<UpdateDevelopmentNode>;

export const ReplyToDevelopmentNodeSchema = strictObject({
  id: commandId, ...nodeFields, promisedOn: LocalDateSchema, evidence,
}) satisfies z.ZodType<ReplyToDevelopmentNode>;

export const LinkDevelopmentNodeSchema = strictObject({
  ...nodeFields, orderLineId: OrderLineIdSchema, procurementLineId: nullable(OrderLineIdSchema),
}) satisfies z.ZodType<LinkDevelopmentNode>;

export const DevelopmentResultSchema = strictObject({ id: EntityIdSchema });

const material = strictObject({
  orderLineId: OrderLineIdSchema, poRaw: nullable(z.string()), itemName: nullable(z.string()), itemCode: nullable(z.string()),
}) satisfies z.ZodType<DevelopmentMaterialOption>;
const order = material.extend({ oaRef: z.string().min(1) }) satisfies z.ZodType<DevelopmentOrderOption>;
export const DevelopmentOrdersSchema = z.array(order);
export const DevelopmentMaterialsSchema = z.array(material);

const reply = strictObject({
  id: EntityIdSchema, nodeId: EntityIdSchema, promisedOn: LocalDateSchema, evidence, actorUserId: EntityIdSchema,
  actorName: nullable(z.string()), recordedAt: z.string(),
});
const batch = strictObject({
  id: z.string(), seq: z.number(), supplierPromisedOn: nullable(LocalDateSchema), buyerConfirmedOn: nullable(LocalDateSchema),
  receiptDates: optional(z.array(LocalDateSchema)),
  plannedQty: optional(z.number()),
  status: optional(BatchStatusSchema),
  fulfillment: BatchFulfillmentSchema,
  reportedShipments: z.array(strictObject({ quantity: z.number(), unit: nullable(z.string()), reportedOn: LocalDateSchema, evidence })),
});
const node = strictObject({
  id: EntityIdSchema, ...projectFields, title, destination: DevelopmentDestinationSchema, ...assignmentFields,
  ownerName: nullable(z.string()), buyerName: nullable(z.string()), canReply: z.boolean(), status: WorkItemStatusSchema,
  version: z.number(), daysUntilRequired: nullable(z.number()), latestReply: nullable(reply), replies: z.array(reply),
  formalLink: nullable(strictObject({ orderLineId: OrderLineIdSchema, oaRef: z.string().min(1), procurementLineId: OrderLineIdSchema })),
  batches: z.array(batch), followUp: optional(followUp),
});
const project = strictObject({
  id: EntityIdSchema, store: ProductDevelopmentStoreSchema, title, productLeadUserId: EntityIdSchema, productLeadName: nullable(z.string()),
  createdBy: EntityIdSchema, createdAt: z.string(), canManage: z.boolean(), nodes: z.array(node),
  progress: optional(DevelopmentProjectProgressSchema), progressVersion: optional(version),
});

export const ProductDevelopmentSchema = strictObject({
  businessDate: LocalDateSchema, canCreateProject: z.boolean(),
  users: z.array(strictObject({ id: EntityIdSchema, name: z.string(), canLead: z.boolean(), canBuy: z.boolean() })),
  projects: z.array(project),
}) satisfies z.ZodType<ProductDevelopmentView>;

export type ProductDevelopment = z.output<typeof ProductDevelopmentSchema>;
export type ProductDevelopmentProject = z.output<typeof project>;
export type ProductDevelopmentNode = z.output<typeof node>;
export type ProductDevelopmentBatch = z.output<typeof batch>;
export type DevelopmentProjectProgress = z.output<typeof DevelopmentProjectProgressSchema>;
export type DevelopmentProjectProgressUpdate = z.output<typeof projectProgressUpdate>;
export type DevelopmentNodeFollowUpInput = z.output<typeof followUpInput>;
export type DevelopmentNodeFollowUp = z.output<typeof followUp>;
