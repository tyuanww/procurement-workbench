import { DEVELOPMENT_DESTINATIONS, PRODUCT_DEVELOPMENT_STORES } from '@sw/domain';
import type {
  CreateDevelopmentNode, CreateDevelopmentProject, DevelopmentMaterialOption, DevelopmentOrderOption, LinkDevelopmentNode,
  ProductDevelopmentView, ReplyToDevelopmentNode, UpdateDevelopmentNode,
} from '../../application/src/product-development/index.js';
import { z } from 'zod';
import { BatchFulfillmentSchema } from './fulfillment.js';
import { WorkItemStatusSchema } from './plan-views.js';
import { nullable, strictObject } from './shape.js';
import { EntityIdSchema, LocalDateSchema, OrderLineIdSchema } from './values.js';

export const ProductDevelopmentStoreSchema = z.enum(PRODUCT_DEVELOPMENT_STORES);
export const DevelopmentDestinationSchema = z.enum(DEVELOPMENT_DESTINATIONS);
const projectFields = { projectId: EntityIdSchema };
const nodeFields = { ...projectFields, nodeId: EntityIdSchema };
const commandId = z.uuid().pipe(EntityIdSchema);
const title = z.string().trim().min(1).max(120);
const evidence = z.string().trim().min(1).max(1000);
const assignmentFields = {
  ownerUserId: nullable(EntityIdSchema),
  buyerUserId: nullable(EntityIdSchema),
  plannedStart: LocalDateSchema,
  plannedEnd: LocalDateSchema,
};

export const DevelopmentScopeSchema = strictObject({ store: z.union([ProductDevelopmentStoreSchema, z.literal('all')]).default('all') });
export const FindDevelopmentOrdersSchema = strictObject({ store: ProductDevelopmentStoreSchema, search: z.string().trim().min(2).max(120) });
export const FindDevelopmentMaterialsSchema = strictObject({ store: ProductDevelopmentStoreSchema, orderLineId: OrderLineIdSchema });

export const CreateDevelopmentProjectSchema = strictObject({
  id: commandId, store: ProductDevelopmentStoreSchema, title, productLeadUserId: EntityIdSchema,
}) satisfies z.ZodType<CreateDevelopmentProject>;

export const CreateDevelopmentNodeSchema = strictObject({
  id: commandId, ...projectFields, title, destination: DevelopmentDestinationSchema, ...assignmentFields,
}) satisfies z.ZodType<CreateDevelopmentNode>;

export const UpdateDevelopmentNodeSchema = strictObject({
  ...nodeFields, expectedVersion: z.number().int().nonnegative(), status: WorkItemStatusSchema, ...assignmentFields,
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
  fulfillment: BatchFulfillmentSchema,
  reportedShipments: z.array(strictObject({ quantity: z.number(), unit: nullable(z.string()), reportedOn: LocalDateSchema, evidence })),
});
const node = strictObject({
  id: EntityIdSchema, ...projectFields, title, destination: DevelopmentDestinationSchema, ...assignmentFields,
  ownerName: nullable(z.string()), buyerName: nullable(z.string()), canReply: z.boolean(), status: WorkItemStatusSchema,
  version: z.number(), daysUntilRequired: nullable(z.number()), latestReply: nullable(reply), replies: z.array(reply),
  formalLink: nullable(strictObject({ orderLineId: OrderLineIdSchema, oaRef: z.string().min(1), procurementLineId: OrderLineIdSchema })),
  batches: z.array(batch),
});
const project = strictObject({
  id: EntityIdSchema, store: ProductDevelopmentStoreSchema, title, productLeadUserId: EntityIdSchema, productLeadName: nullable(z.string()),
  createdBy: EntityIdSchema, createdAt: z.string(), canManage: z.boolean(), nodes: z.array(node),
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
