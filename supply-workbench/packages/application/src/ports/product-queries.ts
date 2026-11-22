import type { ApprovedCodeLink, BomUse, LineStage, PartLink, Product, ProductContact, ProductImage, PurchaseLine, StockRow } from '@sw/domain';
import type { Page } from '../shared/page.js';
import type {
  ProductIdInput,
  ProductList,
  ProductListQuery,
  ProductMaterials,
  ProductOverview,
  ProductPurchases,
  ProductPurchasesQuery,
  ProductStock,
} from '../product-archive/views.js';

/** 读模型只给事实。卡片和明细由用例调 D06。 */
export type ProductArchiveFacts = {
  readonly asOf: string;
  readonly product: Product;
  readonly images: readonly ProductImage[];
  readonly contacts: readonly ProductContact[];
  readonly purchaseLines: readonly PurchaseLine[];
  readonly stockRows: readonly StockRow[];
  readonly approvedLinks: readonly ApprovedCodeLink[];
  readonly parts: readonly PartLink[];
  readonly bomUses: readonly BomUse[];
  readonly handlingHints: ProductOverview['handlingHints'];
  readonly bomHeader: ProductOverview['bomHeader'];
  readonly purchaseRows: readonly { readonly barcodeRaw: string; readonly reportedStatus: string; readonly stage: LineStage; readonly orderLine: ProductPurchases['rows'][number]['orderLine'] }[];
  readonly inTransitRows: readonly { readonly barcodeRaw: string; readonly row: ProductPurchases['inTransit'][number]['row'] }[];
  readonly stockViews: ProductStock['factory']['rows'];
  readonly codeLinkViews: ProductStock['factory']['viaCodeLinks'];
  readonly materialParts: Extract<ProductMaterials, { readonly coverage: unknown }>['parts'];
};

export type ProductListSource = {
  readonly id: string;
  readonly skuName: string;
  readonly barcodeRaw: string;
  readonly barcodeBase: string;
  readonly filingName: string | null;
  readonly netContent: string | null;
  readonly casePack: string | null;
  readonly thumbnail: { readonly fileId: string } | null;
  readonly contactsAssigned: number;
  readonly lines: readonly PurchaseLine[];
  readonly stockRows: readonly StockRow[];
  readonly approvedLinks: readonly ApprovedCodeLink[];
  readonly parts: readonly PartLink[];
};

export interface ProductQueries {
  list(query: ProductListQuery): Promise<ProductList>;
  listSources(query: ProductListQuery): Promise<{ readonly asOf: string; readonly sources: readonly ProductListSource[]; readonly page: Page }>;
  /** 找不到就抛 NotFoundError。 */
  getOverview(input: ProductIdInput): Promise<ProductOverview>;
  load(input: ProductIdInput): Promise<ProductArchiveFacts>;
  getPurchases(input: ProductPurchasesQuery): Promise<ProductPurchases>;
  getStock(input: ProductIdInput): Promise<ProductStock>;
  getMaterials(input: ProductIdInput): Promise<ProductMaterials>;
}
