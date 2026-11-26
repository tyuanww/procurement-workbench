import type {
  ProductCard,
  ProductList,
  ProductMaterials,
  ProductOverview,
  ProductPurchases,
  ProductStock,
  ProductWorkbookPreview,
} from '@sw/application';
import { z } from 'zod';
import { ChannelMatchSchema, FieldSourceSchema, ImageSlotSchema, ImageSourceSchema, ProductContactRoleSchema, PurchaseScopeSchema } from './enums.js';
import { inTransitRow } from './factory-payloads.js';
import { FactoryStockRowViewSchema, CodeLinkViewSchema } from './master-views.js';
import { OrderLineRowSchema } from './follow-up-views.js';
import { nullable, optional, strictObject } from './shape.js';
import { MissingReasonSchema } from './enums.js';
import { provenancedSchema } from './values.js';

const textProvenance = provenancedSchema(z.string());
const numberProvenance = provenancedSchema(z.number());

const stageCounts = strictObject({
  no_batch: z.number(),
  awaiting_date: z.number(),
  awaiting_shipment: z.number(),
  awaiting_receipt: z.number(),
  partially_received: z.number(),
  done: z.number(),
  cancelled: z.number(),
});

export const ProductCardSchema: z.ZodType<ProductCard> = strictObject({
  id: z.string(),
  skuName: z.string(),
  filingName: nullable(z.string()),
  filingNo: optional(nullable(z.string())),
  barcodeRaw: z.string(),
  isChannelVariant: z.boolean(),
  netContent: nullable(z.string()),
  casePack: nullable(z.string()),
  thumbnail: nullable(strictObject({ fileId: z.string(), slot: optional(ImageSlotSchema) })),
  packagingImages: optional(z.array(strictObject({ fileId: z.string(), slot: ImageSlotSchema }))),
  openPurchaseLines: strictObject({ allChannels: z.number(), reportedInProgress: z.number() }),
  factoryStock: numberProvenance,
  bomPartCount: nullable(z.number()),
  materialLinkCoverage: nullable(strictObject({ linked: z.number(), total: z.number() })),
  contactsAssigned: z.number(),
  ownerName: optional(nullable(z.string())),
});

export const ProductListSchema: z.ZodType<ProductList> = strictObject({
  items: z.array(ProductCardSchema),
  page: strictObject({ page: z.number(), pageSize: z.number(), total: z.number() }),
  groups: z.array(strictObject({
    spuKey: nullable(z.string()),
    filingName: nullable(z.string()),
    count: z.number(),
  })),
});

const handlingHint = strictObject({
  source: z.enum(['line_buyer', 'in_transit_buyer_column']),
  text: z.string(),
  lineCount: z.number(),
});

export const ProductOverviewSchema: z.ZodType<ProductOverview> = strictObject({
  product: strictObject({
    id: z.string(),
    barcodeRaw: z.string(),
    barcodeBase: z.string(),
    filingName: textProvenance,
    filingNo: textProvenance,
    skuName: textProvenance,
    netContent: textProvenance,
    casePack: textProvenance,
    outerSize: textProvenance,
    productLine: textProvenance,
    spuKey: nullable(z.string()),
  }),
  images: z.array(strictObject({
    id: z.string(),
    slot: ImageSlotSchema,
    fileId: z.string(),
    source: ImageSourceSchema,
    hidden: z.boolean(),
  })),
  ownerName: optional(nullable(z.string())),
  contacts: z.array(strictObject({
    role: ProductContactRoleSchema,
    people: z.array(strictObject({
      userId: nullable(z.string()),
      name: nullable(z.string()),
      source: FieldSourceSchema,
      note: nullable(z.string()),
      updatedBy: z.string(),
      updatedAt: z.string(),
    })),
  })),
  cards: strictObject({
    purchases: strictObject({
      open: z.number(),
      total: z.number(),
      byStage: stageCounts,
      byReportedStatus: z.record(z.string(), z.number()),
    }),
    stock: z.discriminatedUnion('kind', [
      strictObject({ kind: z.literal('linked'), total: numberProvenance, rowCount: z.number() }),
      strictObject({ kind: z.literal('missing'), reason: MissingReasonSchema, nextStep: nullable(z.literal('review_code_links')) }),
    ]),
    materials: z.union([
      strictObject({ partCount: z.number(), linked: z.number(), sharedPartCount: z.number(), kind: optional(z.never()) }),
      strictObject({ kind: z.literal('no_bom') }),
    ]),
  }),
  bomHeader: nullable(strictObject({ reorderCount: nullable(z.number()), cumulativeQty: nullable(z.number()) })),
  handlingHints: z.array(handlingHint),
});

export const ProductPurchasesSchema: z.ZodType<ProductPurchases> = strictObject({
  scope: PurchaseScopeSchema,
  rows: z.array(strictObject({ orderLine: OrderLineRowSchema, channelMatch: ChannelMatchSchema })),
  inTransit: z.array(strictObject({ row: inTransitRow, channelMatch: ChannelMatchSchema })),
  byStage: stageCounts,
  byReportedStatus: z.record(z.string(), z.number()),
});

export const ProductStockSchema: z.ZodType<ProductStock> = strictObject({
  ownWarehouse: strictObject({ value: z.null(), reason: z.literal('no_source') }),
  factory: strictObject({
    rows: z.array(FactoryStockRowViewSchema),
    total: nullable(numberProvenance),
    viaCodeLinks: z.array(CodeLinkViewSchema),
  }),
});

export const ProductMaterialsSchema: z.ZodType<ProductMaterials> = z.union([
  strictObject({ kind: z.literal('no_bom') }),
  strictObject({
    coverage: strictObject({ linked: z.number(), total: z.number() }),
    parts: z.array(strictObject({
      partCodeRaw: z.string(),
      partName: z.string(),
      ownerName: optional(nullable(z.string())),
      links: strictObject({
        materialLines: z.number(),
        demandRows: z.number(),
        customerSupplied: z.number(),
        inTransit: z.number(),
      }),
      usedByProducts: z.array(strictObject({ id: z.string(), skuName: z.string() })),
      handlingHints: z.array(handlingHint),
    })),
  }),
]);

export const ProductWorkbookPreviewSchema: z.ZodType<ProductWorkbookPreview> = strictObject({
  id: z.string(),
  fileName: z.string(),
  status: z.enum(['ready', 'blocked', 'unchanged', 'committed', 'stale']),
  products: z.array(strictObject({
    id: nullable(z.string()),
    barcode: z.string(),
    name: z.string(),
    changes: z.array(strictObject({
      section: z.enum(['product', 'image', 'bom']),
      label: z.string(),
      before: nullable(z.string()),
      after: nullable(z.string()),
      beforeImageUrl: optional(z.string()),
      afterImageUrl: optional(z.string()),
    })),
  })),
  issues: z.array(strictObject({
    sheet: z.string(),
    row: nullable(z.number()),
    field: nullable(z.string()),
    message: z.string(),
  })),
});
