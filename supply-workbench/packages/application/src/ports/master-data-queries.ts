import type { KpiInput } from '@sw/domain';
import type { ListResult } from '../shared/page.js';
import type {
  AliasListQuery,
  CodeLinkView,
  CodeListQuery,
  CustomerSuppliedQuery,
  CustomerSuppliedRowView,
  DemandListQuery,
  DemandRowView,
  FactoryReportRowView,
  ItemCodeView,
  ItemDetail,
  ItemListQuery,
  ItemView,
  LinkListQuery,
  MultiNameView,
  PartyAliasView,
  PartyDetail,
  PartyDetailQuery,
  PartyListQuery,
  PartyView,
  ReviewCounts,
  UnlinkedQuery,
} from '../master-data/views.js';
import type { PageQuery } from '../shared/page.js';

export interface MasterDataQueries {
  /** 四个队列的待审核条数。空队列是 0，不是缺失。 */
  reviewCounts(): Promise<ReviewCounts>;
  listAliases(query: AliasListQuery): Promise<ListResult<PartyAliasView>>;
  listCodes(query: CodeListQuery): Promise<ListResult<ItemCodeView>>;
  listCodeLinks(query: LinkListQuery): Promise<ListResult<CodeLinkView>>;
  listMultiName(query: PageQuery): Promise<ListResult<MultiNameView>>;
  listParties(query: PartyListQuery): Promise<ListResult<PartyView>>;
  /** 找不到就抛 NotFoundError。指标由用例用 loadPartyKpi 调 D04，这里的 kpis 不作为口径。 */
  getParty(query: PartyDetailQuery): Promise<PartyDetail>;
  /** 这个主体在期间内的 D04 输入。期间缺了就由读模型给默认期间。 */
  loadPartyKpi(query: PartyDetailQuery): Promise<KpiInput>;
  listItems(query: ItemListQuery): Promise<ListResult<ItemView>>;
  /** 找不到就抛 NotFoundError。 */
  getItem(itemId: string): Promise<ItemDetail>;
  listUnlinked(query: UnlinkedQuery): Promise<ListResult<FactoryReportRowView>>;
  listDemand(query: DemandListQuery): Promise<ListResult<DemandRowView>>;
  listCustomerSupplied(query: CustomerSuppliedQuery): Promise<ListResult<CustomerSuppliedRowView>>;
}
