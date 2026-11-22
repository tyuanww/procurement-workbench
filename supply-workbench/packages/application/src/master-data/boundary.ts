import type { Actor } from '../shared/actor.js';
import type { NoInput } from '../shared/refs.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { MasterDataQueries } from '../ports/master-data-queries.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type { ListResult, PageQuery } from '../shared/page.js';
import type {
  AliasListQuery,
  ApproveAliasInput,
  ApproveCodeInput,
  BulkCreateItemsInput,
  CodeLinkView,
  CodeListQuery,
  CreatePartyInput,
  CustomerSuppliedQuery,
  CustomerSuppliedRowView,
  DemandListQuery,
  DemandRowView,
  FactoryReportRowView,
  ItemCodeView,
  ItemDetail,
  ItemListQuery,
  ItemView,
  LinkFactoryRowInput,
  LinkListQuery,
  MultiNameView,
  PartyAliasView,
  PartyDetail,
  PartyDetailQuery,
  PartyListQuery,
  PartyView,
  RejectAliasInput,
  RejectCodeInput,
  ResolveMultiNameInput,
  ReviewCounts,
  ReviewLinkInput,
  UnlinkedQuery,
  UpdatePartyInput,
} from './views.js';

export type * from './views.js';

type ReviewWrite = { readonly uow: UnitOfWork; readonly clock: Clock; readonly ids: IdGenerator };
type Read = { readonly master: MasterDataQueries };

export type ApproveAliasDeps = ReviewWrite;
export type ApproveAlias = (input: ApproveAliasInput, actor: Actor) => Promise<{ readonly aliasId: string }>;
export type RejectAliasDeps = ReviewWrite;
export type RejectAlias = (input: RejectAliasInput, actor: Actor) => Promise<{ readonly aliasId: string }>;
export type ApproveCodeDeps = ReviewWrite;
export type ApproveCode = (input: ApproveCodeInput, actor: Actor) => Promise<{ readonly codeId: string }>;
export type RejectCodeDeps = ReviewWrite;
export type RejectCode = (input: RejectCodeInput, actor: Actor) => Promise<{ readonly codeId: string }>;
export type BulkCreateItemsDeps = ReviewWrite;
export type BulkCreateItems = (input: BulkCreateItemsInput, actor: Actor) => Promise<{ readonly created: number }>;
export type ApproveCodeLinkDeps = ReviewWrite;
export type ApproveCodeLink = (input: ReviewLinkInput, actor: Actor) => Promise<{ readonly linkId: string }>;
export type RejectCodeLinkDeps = ReviewWrite;
export type RejectCodeLink = (input: ReviewLinkInput, actor: Actor) => Promise<{ readonly linkId: string }>;
export type ResolveMultiNameDeps = ReviewWrite;
export type ResolveMultiName = (input: ResolveMultiNameInput, actor: Actor) => Promise<{ readonly codeId: string }>;
export type LinkFactoryRowDeps = ReviewWrite;
export type LinkedFactoryRow = {
  readonly rowId: string;
  readonly kind: Exclude<FactoryReportRowView['kind'], 'customer_supplied'>;
};
export type LinkFactoryRow = (input: LinkFactoryRowInput, actor: Actor) => Promise<LinkedFactoryRow>;
export type CreatePartyDeps = ReviewWrite;
export type CreateParty = (input: CreatePartyInput, actor: Actor) => Promise<{ readonly partyId: string }>;
export type UpdatePartyDeps = ReviewWrite;
export type UpdateParty = (input: UpdatePartyInput, actor: Actor) => Promise<{ readonly partyId: string }>;

export type GetReviewCountsDeps = Read;
export type GetReviewCounts = (input: NoInput, actor: Actor) => Promise<ReviewCounts>;
export type ListAliasesDeps = Read;
export type ListAliases = (input: AliasListQuery, actor: Actor) => Promise<ListResult<PartyAliasView>>;
export type ListCodesDeps = Read;
export type ListCodes = (input: CodeListQuery, actor: Actor) => Promise<ListResult<ItemCodeView>>;
export type ListCodeLinksDeps = Read;
export type ListCodeLinks = (input: LinkListQuery, actor: Actor) => Promise<ListResult<CodeLinkView>>;
export type ListMultiNameDeps = Read;
export type ListMultiName = (input: PageQuery, actor: Actor) => Promise<ListResult<MultiNameView>>;
export type ListPartiesDeps = Read;
export type ListParties = (input: PartyListQuery, actor: Actor) => Promise<ListResult<PartyView>>;
export type GetPartyDetailDeps = Read;
export type GetPartyDetail = (input: PartyDetailQuery, actor: Actor) => Promise<PartyDetail>;
export type ListItemsDeps = Read;
export type ListItems = (input: ItemListQuery, actor: Actor) => Promise<ListResult<ItemView>>;
export type GetItemDeps = Read;
export type GetItem = (input: { readonly itemId: string }, actor: Actor) => Promise<ItemDetail>;
export type ListUnlinkedFactoryRowsDeps = Read;
export type ListUnlinkedFactoryRows = (input: UnlinkedQuery, actor: Actor) => Promise<ListResult<FactoryReportRowView>>;
export type ListDemandRowsDeps = Read;
export type ListDemandRows = (input: DemandListQuery, actor: Actor) => Promise<ListResult<DemandRowView>>;
export type ListCustomerSuppliedDeps = Read;
export type ListCustomerSupplied = (input: CustomerSuppliedQuery, actor: Actor) => Promise<ListResult<CustomerSuppliedRowView>>;
