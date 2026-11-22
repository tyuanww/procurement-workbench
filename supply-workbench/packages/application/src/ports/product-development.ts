import type { BatchFulfillment, DevelopmentDestination, EntityId, LocalDate, OrderLineId, ProductDevelopmentStore, WorkItem } from '@sw/domain';
import type { WorkItemEvent } from '../../../domain/src/entities/work-items.js';
import type { WorkItemEventRepository, WorkItemRepository } from './plan.js';
import type { UnitOfWork, UnitOfWorkStores } from './unit-of-work.js';

export type DevelopmentProject = {
  readonly id: EntityId;
  readonly store: ProductDevelopmentStore;
  readonly title: string;
  readonly productLeadUserId: EntityId;
  readonly createdBy: EntityId;
  readonly createdAt: string;
};

export type DevelopmentOrderLink = {
  readonly orderLineId: OrderLineId;
  readonly oaRef: string;
  readonly procurementLineId: OrderLineId;
};

export type DevelopmentNode = {
  readonly id: EntityId;
  readonly projectId: EntityId;
  readonly destination: DevelopmentDestination;
  readonly buyerUserId: EntityId | null;
  readonly formalLink: DevelopmentOrderLink | null;
};

export type DevelopmentReply = {
  readonly id: EntityId;
  readonly nodeId: EntityId;
  readonly promisedOn: LocalDate;
  readonly evidence: string;
  readonly actorUserId: EntityId;
  readonly actorName: string | null;
  readonly recordedAt: string;
};

export type DevelopmentNodeRow = DevelopmentNode & Pick<WorkItem, 'title' | 'plannedStart' | 'plannedEnd' | 'status' | 'version' | 'ownerUserId'> & {
  readonly ownerName: string | null;
  readonly buyerName: string | null;
};

export type DevelopmentProjectRow = DevelopmentProject & { readonly productLeadName: string | null };

export type DevelopmentBatch = {
  readonly id: string;
  readonly seq: number;
  readonly supplierPromisedOn: LocalDate | null;
  readonly buyerConfirmedOn: LocalDate | null;
  readonly fulfillment: BatchFulfillment;
  readonly reportedShipments: readonly {
    readonly quantity: number;
    readonly unit: string | null;
    readonly reportedOn: LocalDate;
    readonly evidence: string;
  }[];
};

export type DevelopmentOrderOption = {
  readonly orderLineId: OrderLineId;
  readonly oaRef: string;
  readonly poRaw: string | null;
  readonly itemName: string | null;
  readonly itemCode: string | null;
};

export type DevelopmentMaterialOption = Pick<DevelopmentOrderOption, 'orderLineId' | 'poRaw' | 'itemName' | 'itemCode'>;
export type DevelopmentUsers = readonly { readonly id: EntityId; readonly name: string; readonly canLead: boolean; readonly canBuy: boolean }[];
export type DevelopmentScope = ProductDevelopmentStore | 'all';

export interface DevelopmentQueries {
  projects(store: DevelopmentScope): Promise<readonly DevelopmentProjectRow[]>;
  nodes(store: DevelopmentScope): Promise<readonly DevelopmentNodeRow[]>;
  replies(nodeIds: readonly EntityId[]): Promise<readonly DevelopmentReply[]>;
  batches(lineIds: readonly OrderLineId[]): Promise<ReadonlyMap<OrderLineId, readonly DevelopmentBatch[]>>;
  orders(input: { readonly store: ProductDevelopmentStore; readonly search: string }): Promise<readonly DevelopmentOrderOption[]>;
  materials(input: { readonly store: ProductDevelopmentStore; readonly orderLineId: OrderLineId }): Promise<readonly DevelopmentMaterialOption[]>;
  users(): Promise<DevelopmentUsers>;
}

interface DevelopmentRepository {
  insertProject(project: DevelopmentProject): Promise<boolean>;
  lockProject(id: EntityId): Promise<DevelopmentProject>;
  findNode(id: EntityId): Promise<DevelopmentNode | undefined>;
  insertNode(node: DevelopmentNode): Promise<void>;
  updateNode(node: DevelopmentNode): Promise<void>;
  event(id: EntityId): Promise<WorkItemEvent | undefined>;
  validOrder(input: { readonly store: ProductDevelopmentStore; readonly orderLineId: OrderLineId }): Promise<DevelopmentOrderOption | undefined>;
  isMaterial(input: { readonly store: ProductDevelopmentStore; readonly orderLineId: OrderLineId; readonly materialLineId: OrderLineId }): Promise<boolean>;
}

export type DevelopmentStores = UnitOfWorkStores & {
  readonly development: DevelopmentRepository;
  readonly workItems: WorkItemRepository;
  readonly workItemEvents: WorkItemEventRepository;
};

export type DevelopmentUnitOfWork = UnitOfWork<DevelopmentStores>;
