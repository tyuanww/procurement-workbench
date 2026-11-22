import type {
  ChannelMatch,
  EntityId,
  FieldSource,
  ImageSlot,
  ImageSource,
  LineStage,
  Missing,
  ProductContactRole,
  ProductId,
  Provenanced,
  PurchaseScope,
} from '@sw/domain';
import type { OrderLineRow } from '../follow-up/index.js';
import type { CodeLinkView, FactoryReportOf, FactoryStockRowView } from '../master-data/index.js';
import type { PageQuery } from '../shared/page.js';

export type ProductCard = {
  readonly id: string;
  readonly skuName: string;
  readonly filingName: string | null;
  readonly barcodeRaw: string;
  readonly isChannelVariant: boolean;
  readonly netContent: string | null;
  readonly casePack: string | null;
  readonly thumbnail: { readonly fileId: string } | null;
  readonly openPurchaseLines: { readonly allChannels: number; readonly reportedInProgress: number };
  readonly factoryStock: Provenanced<number>;
  readonly bomPartCount: number | null;
  readonly materialLinkCoverage: { readonly linked: number; readonly total: number } | null;
  readonly contactsAssigned: number;
};

export type ProductList = {
  readonly items: readonly ProductCard[];
  readonly page: { readonly page: number; readonly pageSize: number; readonly total: number };
  readonly groups: readonly { readonly spuKey: string | null; readonly filingName: string | null; readonly count: number }[];
};

export type ProductField = Provenanced<string>;

export type ProductOverview = {
  readonly product: {
    readonly id: string;
    readonly barcodeRaw: string;
    readonly barcodeBase: string;
    readonly filingName: ProductField;
    readonly filingNo: ProductField;
    readonly skuName: ProductField;
    readonly netContent: ProductField;
    readonly casePack: ProductField;
    readonly outerSize: ProductField;
    readonly productLine: ProductField;
    readonly spuKey: string | null;
  };
  readonly images: readonly {
    readonly id: string;
    readonly slot: ImageSlot;
    readonly fileId: string;
    readonly source: ImageSource;
    readonly hidden: boolean;
  }[];
  readonly contacts: readonly {
    readonly role: ProductContactRole;
    readonly people: readonly {
      readonly userId: string | null;
      readonly name: string | null;
      readonly source: FieldSource;
      readonly note: string | null;
      readonly updatedBy: string;
      readonly updatedAt: string;
    }[];
  }[];
  readonly cards: {
    readonly purchases: {
      readonly open: number;
      readonly total: number;
      readonly byStage: Readonly<Record<LineStage, number>>;
      readonly byReportedStatus: Readonly<Record<string, number>>;
    };
    readonly stock:
      | { readonly kind: 'linked'; readonly total: Provenanced<number>; readonly rowCount: number }
      | { readonly kind: 'missing'; readonly reason: Missing['reason']; readonly nextStep: 'review_code_links' | null };
    readonly materials:
      | { readonly partCount: number; readonly linked: number; readonly sharedPartCount: number; readonly kind?: never }
      | { readonly kind: 'no_bom' };
  };
  readonly bomHeader: { readonly reorderCount: number | null; readonly cumulativeQty: number | null } | null;
  readonly handlingHints: readonly {
    readonly source: 'line_buyer' | 'in_transit_buyer_column';
    readonly text: string;
    readonly lineCount: number;
  }[];
};

export type ProductPurchases = {
  readonly scope: PurchaseScope;
  readonly rows: readonly { readonly orderLine: OrderLineRow; readonly channelMatch: ChannelMatch }[];
  readonly inTransit: readonly { readonly row: FactoryReportOf<'in_transit'>; readonly channelMatch: ChannelMatch }[];
  readonly byStage: Readonly<Record<LineStage, number>>;
  readonly byReportedStatus: Readonly<Record<string, number>>;
};

export type ProductStock = {
  readonly ownWarehouse: { readonly value: null; readonly reason: 'no_source' };
  readonly factory: {
    readonly rows: readonly FactoryStockRowView[];
    readonly total: Provenanced<number> | null;
    readonly viaCodeLinks: readonly CodeLinkView[];
  };
};

export type ProductMaterials =
  | { readonly kind: 'no_bom' }
  | {
      readonly coverage: { readonly linked: number; readonly total: number };
      readonly parts: readonly {
        readonly partCodeRaw: string;
        readonly partName: string;
        readonly links: {
          readonly materialLines: number;
          readonly demandRows: number;
          readonly customerSupplied: number;
          readonly inTransit: number;
        };
        readonly usedByProducts: readonly { readonly id: string; readonly skuName: string }[];
        readonly handlingHints: ProductOverview['handlingHints'];
      }[];
    };

export type ProductListQuery = PageQuery & { readonly q?: string; readonly productLine?: string };
export type ProductIdInput = { readonly productId: string };
export type ProductPurchasesQuery = { readonly productId: string; readonly scope?: PurchaseScope; readonly stage?: LineStage };
export type UpdateProductInput = {
  readonly productId: ProductId;
  readonly filingName?: string;
  readonly filingNo?: string;
  readonly skuName?: string;
  readonly netContent?: string;
  readonly casePack?: string;
  readonly outerSize?: string;
  readonly productLine?: string;
};
export type AddProductImageInput = {
  readonly productId: ProductId;
  readonly slot: ImageSlot;
  readonly file: { readonly bytes: Uint8Array; readonly fileName: string; readonly mime: string };
};
export type HideProductImageInput = { readonly productId: string; readonly imageId: string; readonly reason: string };
export type SetProductContactsInput = {
  readonly productId: ProductId;
  readonly role: ProductContactRole;
  readonly people: readonly { readonly userId?: EntityId; readonly nameRaw?: string; readonly note?: string }[];
};
