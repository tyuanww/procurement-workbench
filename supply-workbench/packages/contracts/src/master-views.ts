import type {
  CodeLinkView,
  CustomerSuppliedRowView,
  DemandRowView,
  FactoryReportRowView,
  FactoryStockRowView,
  ItemCodeView,
  ItemDetail,
  ItemView,
  KpiFigure,
  KpiFigures,
  MultiNameView,
  PartyAliasView,
  PartyDetail,
  PartyView,
  ReviewCounts,
} from '@sw/application';
import { z } from 'zod';
import { CodeTypeSchema, ItemKindSchema, LinkStatusSchema, ReviewStatusSchema } from './enums.js';
import { comboPayload, demandPayload, inTransitPayload, schedulePayload, shipmentPayload, stockPayload, suppliedPayload } from './factory-payloads.js';
import { nullable, strictObject } from './shape.js';
import { LocalDateSchema } from './values.js';

const envelope = {
  id: z.string(),
  importBatchId: z.string(),
  factoryPartyId: z.string(),
  sheetName: z.string(),
  rowNo: z.number(),
  fingerprint: z.string(),
  linkedOrderLineId: nullable(z.string()),
  linkStatus: LinkStatusSchema,
  linkReason: nullable(z.string()),
};

export const ItemCodeViewSchema: z.ZodType<ItemCodeView> = strictObject({
  id: z.string(),
  codeType: CodeTypeSchema,
  codeRaw: z.string(),
  codeNorm: z.string(),
  itemId: nullable(z.string()),
  status: ReviewStatusSchema,
});

export const CodeLinkViewSchema: z.ZodType<CodeLinkView> = strictObject({
  id: z.string(),
  fromCodeId: z.string(),
  toCodeId: z.string(),
  status: ReviewStatusSchema,
  evidence: z.unknown(),
  reviewedBy: nullable(z.string()),
  reviewedAt: nullable(z.string()),
});

export const PartyAliasViewSchema: z.ZodType<PartyAliasView> = strictObject({
  id: z.string(),
  rawName: z.string(),
  normName: z.string(),
  partyId: nullable(z.string()),
  status: ReviewStatusSchema,
  firstSeenImportBatchId: nullable(z.string()),
  seenCount: z.number(),
  reviewedBy: nullable(z.string()),
  reviewedAt: nullable(z.string()),
  similar: z.array(strictObject({ partyId: z.string(), displayName: z.string() })),
});

export const MultiNameViewSchema: z.ZodType<MultiNameView> = strictObject({
  codeId: z.string(),
  codeRaw: z.string(),
  names: z.array(strictObject({ nameRaw: z.string(), count: z.number() })),
});

export const PartyViewSchema: z.ZodType<PartyView> = strictObject({
  id: z.string(),
  displayName: z.string(),
  isSupplier: z.boolean(),
  isFactory: z.boolean(),
  isOwnWarehouse: z.boolean(),
  note: nullable(z.string()),
});

export const ItemViewSchema: z.ZodType<ItemView> = strictObject({
  id: z.string(),
  displayName: z.string(),
  kind: ItemKindSchema,
  spec: nullable(z.string()),
  sharedCodeFlag: z.boolean(),
});

export const ItemDetailSchema: z.ZodType<ItemDetail> = strictObject({
  item: ItemViewSchema,
  codes: z.array(ItemCodeViewSchema),
  names: z.array(strictObject({ nameRaw: z.string(), seenCount: z.number() })),
});

export const KpiFigureSchema: z.ZodType<KpiFigure> = strictObject({
  numerator: nullable(z.number()),
  denominator: nullable(z.number()),
  n: z.number(),
});

export const KpiFiguresSchema: z.ZodType<KpiFigures> = strictObject({
  dueBatches: KpiFigureSchema,
  onTime: KpiFigureSchema,
  averageDelayDays: KpiFigureSchema,
  overdueNow: KpiFigureSchema,
  dateChanges: KpiFigureSchema,
  noteReturnDays: KpiFigureSchema,
  openExceptions: KpiFigureSchema,
});

export const PartyDetailSchema: z.ZodType<PartyDetail> = strictObject({
  party: PartyViewSchema,
  aliases: z.array(PartyAliasViewSchema),
  kpis: KpiFiguresSchema,
  kpiWindow: strictObject({ from: LocalDateSchema, to: LocalDateSchema }),
});

export const ReviewCountsSchema: z.ZodType<ReviewCounts> = strictObject({
  aliases: z.number(),
  codes: z.number(),
  links: z.number(),
  multiName: z.number(),
});

export const FactoryReportRowViewSchema: z.ZodType<FactoryReportRowView> = z.discriminatedUnion('kind', [
  strictObject({ ...envelope, kind: z.literal('in_transit'), payload: inTransitPayload }),
  strictObject({ ...envelope, kind: z.literal('shipment'), payload: shipmentPayload }),
  strictObject({ ...envelope, kind: z.literal('stock'), payload: stockPayload }),
  strictObject({ ...envelope, kind: z.literal('schedule'), payload: schedulePayload }),
  strictObject({ ...envelope, kind: z.literal('demand'), payload: demandPayload }),
  strictObject({ ...envelope, kind: z.literal('packaging_combo'), payload: comboPayload }),
  strictObject({ ...envelope, kind: z.literal('customer_supplied'), payload: suppliedPayload }),
]);

export const FactoryStockRowViewSchema: z.ZodType<FactoryStockRowView> = strictObject({
  ...envelope,
  kind: z.literal('stock'),
  payload: stockPayload,
});

export const DemandRowViewSchema: z.ZodType<DemandRowView> = strictObject({
  ...envelope,
  kind: z.literal('demand'),
  payload: demandPayload,
  generatedBatches: z.array(strictObject({ batchId: z.string(), slotIndex: z.number() })),
});

export const CustomerSuppliedRowViewSchema: z.ZodType<CustomerSuppliedRowView> = strictObject({
  ...envelope,
  kind: z.literal('customer_supplied'),
  payload: suppliedPayload,
});

export type { CodeLinkView, CustomerSuppliedRowView, DemandRowView, FactoryReportRowView, FactoryStockRowView, ItemCodeView, ItemDetail, ItemView, MultiNameView, PartyAliasView, PartyDetail, PartyView, ReviewCounts };
