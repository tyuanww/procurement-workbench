import type {
  AssignOwner,
  GetOwnerCoverage,
  ListPendingOwners,
  ResolvePendingOwner,
} from '@sw/application';

export type OwnerApi = {
  coverage: GetOwnerCoverage;
  pending: ListPendingOwners;
  assign: AssignOwner;
  resolve: ResolvePendingOwner;
};
