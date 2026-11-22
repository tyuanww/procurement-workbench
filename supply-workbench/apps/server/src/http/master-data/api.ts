import type {
  ApproveAlias,
  ApproveCode,
  ApproveCodeLink,
  BulkCreateItems,
  CreateLineFromInTransit,
  CreateParty,
  GetItem,
  GetLineDetail,
  GetPartyDetail,
  GetReviewCounts,
  LinkFactoryRow,
  ListAliases,
  ListCodeLinks,
  ListCodes,
  ListCustomerSupplied,
  ListDemandRows,
  ListItems,
  ListMultiName,
  ListParties,
  ListUnlinkedFactoryRows,
  RejectAlias,
  RejectCode,
  RejectCodeLink,
  ResolveMultiName,
  UpdateParty,
} from '@sw/application';
import type { CodeLinkView, FactoryReportRowView, ItemCodeView, MultiNameView, PartyAliasView, PartyView } from '@sw/application';

export type MasterApi = {
  reviewCounts: GetReviewCounts;
  listAliases: ListAliases;
  approveAlias: ApproveAlias;
  rejectAlias: RejectAlias;
  aliasView(id: string): Promise<PartyAliasView>;
  listCodes: ListCodes;
  approveCode: ApproveCode;
  rejectCode: RejectCode;
  bulkCreate: BulkCreateItems;
  codeView(id: string): Promise<ItemCodeView>;
  listLinks: ListCodeLinks;
  approveLink: ApproveCodeLink;
  rejectLink: RejectCodeLink;
  linkView(id: string): Promise<CodeLinkView>;
  listMultiName: ListMultiName;
  resolveMulti: ResolveMultiName;
  multiView(id: string): Promise<MultiNameView>;
  listParties: ListParties;
  getParty: GetPartyDetail;
  createParty: CreateParty;
  updateParty: UpdateParty;
  partyView(id: string): Promise<PartyView>;
  listItems: ListItems;
  getItem: GetItem;
  listUnlinked: ListUnlinkedFactoryRows;
  listDemand: ListDemandRows;
  listSupplied: ListCustomerSupplied;
  linkRow(...args: Parameters<LinkFactoryRow>): Promise<FactoryReportRowView>;
  lineFromTransit: CreateLineFromInTransit;
  lineDetail: GetLineDetail;
};
