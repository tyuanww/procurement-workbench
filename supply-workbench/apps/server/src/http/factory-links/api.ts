import type {
  BackfillSupplierParties,
  GetFactoryLinkCounts,
  GetLineFactoryLink,
  ListUnmatchedFactoryRows,
  RelinkFactoryRows,
  RelinkScheduleCells,
  SetLineFactoryLink,
} from '@sw/application';

export type FactoryLinkApi = {
  counts: GetFactoryLinkCounts;
  unmatched: ListUnmatchedFactoryRows;
  relink: RelinkFactoryRows;
  relinkSchedule: RelinkScheduleCells;
  backfillSuppliers: BackfillSupplierParties;
  getLine: GetLineFactoryLink;
  setLine: SetLineFactoryLink;
};
