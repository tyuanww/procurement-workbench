import type { DevelopmentFollowUpInput, DevelopmentProgressDraft, DevelopmentProgressUpdate, EntityId, LocalDate, OrderLineId, WorkItem } from '@sw/domain';
import type {
  DevelopmentBatch, DevelopmentNode, DevelopmentNodeRow, DevelopmentProject, DevelopmentProjectRow, DevelopmentReply, DevelopmentUsers,
} from '../ports/product-development.js';

export type CreateDevelopmentProject = Pick<DevelopmentProject, 'id' | 'store' | 'title' | 'productLeadUserId'> & {
  readonly progress?: DevelopmentProgressDraft;
};
export type UpdateDevelopmentProjectProgress = {
  readonly projectId: EntityId;
  readonly expectedVersion: number;
  readonly progress: DevelopmentProgressUpdate;
};
export type CreateDevelopmentNode = Pick<DevelopmentNode, 'id' | 'projectId' | 'destination' | 'buyerUserId'> &
  Pick<WorkItem, 'title' | 'ownerUserId' | 'plannedStart' | 'plannedEnd'>;
export type UpdateDevelopmentNode = Pick<CreateDevelopmentNode, 'projectId' | 'ownerUserId' | 'buyerUserId' | 'plannedStart' | 'plannedEnd'> & {
  readonly nodeId: EntityId;
  readonly expectedVersion: number;
  readonly status: WorkItem['status'];
  readonly followUp?: DevelopmentFollowUpInput;
};
export type ReplyToDevelopmentNode = Pick<DevelopmentReply, 'id' | 'nodeId' | 'promisedOn' | 'evidence'> & {
  readonly projectId: EntityId;
};
export type LinkDevelopmentNode = {
  readonly projectId: EntityId;
  readonly nodeId: EntityId;
  readonly orderLineId: OrderLineId;
  readonly procurementLineId: OrderLineId | null;
};

export type DevelopmentNodeView = DevelopmentNodeRow & {
  readonly daysUntilRequired: number | null;
  readonly canReply: boolean;
  readonly latestReply: DevelopmentReply | null;
  readonly replies: readonly DevelopmentReply[];
  readonly batches: readonly DevelopmentBatch[];
};

export type DevelopmentProjectView = Omit<DevelopmentProjectRow, 'progressVersion'> & {
  readonly progressVersion?: number;
  readonly canManage: boolean;
  readonly nodes: readonly DevelopmentNodeView[];
};

export type ProductDevelopmentView = {
  readonly businessDate: LocalDate;
  readonly canCreateProject: boolean;
  readonly users: DevelopmentUsers;
  readonly projects: readonly DevelopmentProjectView[];
};
