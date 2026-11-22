import { z } from 'zod';
import { strictObject } from './shape.js';

export const LineFactoryLinkStatusSchema = z.enum(['linked', 'unlinked', 'manual']);
export type LineFactoryLinkStatus = z.infer<typeof LineFactoryLinkStatusSchema>;

export const LineFactoryLinkSourceSchema = z.enum(['po_master', 'factory_progress', 'relink', 'manual']);
export type LineFactoryLinkSource = z.infer<typeof LineFactoryLinkSourceSchema>;

export const LineFactoryMatchBasisSchema = z.enum(['po', 'item_code', 'barcode', 'column', 'manual', 'none']);
export type LineFactoryMatchBasis = z.infer<typeof LineFactoryMatchBasisSchema>;

export const FactoryRefSchema = strictObject({ id: z.string(), displayName: z.string() });

export const LineFactoryLinkViewSchema = strictObject({
  orderLineId: z.string(),
  factory: z.union([FactoryRefSchema, z.null()]),
  status: LineFactoryLinkStatusSchema,
  source: LineFactoryLinkSourceSchema,
  confidence: LineFactoryMatchBasisSchema,
  reason: z.union([z.string(), z.null()]),
  linkedAt: z.string(),
});
export type LineFactoryLinkView = z.infer<typeof LineFactoryLinkViewSchema>;

export const FactoryLinkCountsSchema = strictObject({
  linked: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
  unlinked: z.number().int().nonnegative(),
});
export type FactoryLinkCounts = z.infer<typeof FactoryLinkCountsSchema>;

export const RelinkFactoryRowsRequestSchema = strictObject({
  limit: z.number().int().positive().optional(),
});
export type RelinkFactoryRowsRequest = z.infer<typeof RelinkFactoryRowsRequestSchema>;

export const RelinkFactoryRowsResultSchema = strictObject({
  factoryRows: z.number().int().nonnegative(),
  factoryLinked: z.number().int().nonnegative(),
  factoryManual: z.number().int().nonnegative(),
  factoryUnlinked: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  linesLinked: z.number().int().nonnegative(),
  linesUnlinked: z.number().int().nonnegative(),
  byBasis: strictObject({
    po: z.number().int().nonnegative(),
    item_code: z.number().int().nonnegative(),
    barcode: z.number().int().nonnegative(),
  }),
});
export type RelinkFactoryRowsResult = z.infer<typeof RelinkFactoryRowsResultSchema>;

export const RelinkScheduleCellsResultSchema = strictObject({
  scheduleCells: z.number().int().nonnegative(),
  linked: z.number().int().nonnegative(),
  unlinked: z.number().int().nonnegative(),
  ambiguous: z.number().int().nonnegative(),
  manual: z.number().int().nonnegative(),
  review: z.number().int().nonnegative(),
});
export type RelinkScheduleCellsResult = z.infer<typeof RelinkScheduleCellsResultSchema>;

export const SetLineFactoryLinkRequestSchema = strictObject({
  factoryPartyId: z.union([z.string(), z.null()]),
  reason: z.string().optional(),
});
export type SetLineFactoryLinkRequest = z.infer<typeof SetLineFactoryLinkRequestSchema>;

export const UnmatchedFactoryRowViewSchema = strictObject({
  rowId: z.string(),
  kind: z.string(),
  factoryPartyId: z.string(),
  poRaw: z.union([z.string(), z.null()]),
  itemCodeRaw: z.union([z.string(), z.null()]),
  barcodeRaw: z.union([z.string(), z.null()]),
  reason: z.string(),
  suggestedAction: z.string(),
});
export type UnmatchedFactoryRowView = z.infer<typeof UnmatchedFactoryRowViewSchema>;

export const UnmatchedFactoryRowListSchema = strictObject({ items: z.array(UnmatchedFactoryRowViewSchema) });
export type UnmatchedFactoryRowList = z.infer<typeof UnmatchedFactoryRowListSchema>;

export const SupplierBackfillResultSchema = strictObject({ updated: z.number().int().nonnegative() });
export type SupplierBackfillResult = z.infer<typeof SupplierBackfillResultSchema>;
