import { UNLINKED_PROCUREMENT } from '@sw/domain';
import type { ProcurementReviewReason, ProcurementPreviewSelection } from '@sw/application';
import { z } from 'zod';
import { nullable, optional, strictObject } from './shape.js';

const rowNumber = z.number().int().positive();
const source = strictObject({ sheetName: z.string(), rowNo: rowNumber });
const cellSource = source.extend({
  column: rowNumber,
  range: nullable(strictObject({
    startRow: rowNumber,
    endRow: rowNumber,
    startColumn: rowNumber,
    endColumn: rowNumber,
  })),
});
const oaRef = strictObject({ raw: z.string(), main: z.string() });
const text = nullable(z.string());
const quantity = nullable(z.number());

export const procurementFact = strictObject({
  source,
  status: z.enum(['active', 'completed']),
  oa: strictObject({ raw: text, refs: z.array(oaRef), source: nullable(cellSource) }),
  productCodes: strictObject({ raw: text, source: nullable(cellSource) }),
  componentCodeRaw: text,
  componentNameRaw: text,
  poRaw: text,
  supplierRaw: text,
  buyerRaw: text,
  deliveryProgressRaw: optional(text),
  quantityRaw: text,
  quantityUnitConflict: optional(z.literal(true)),
  quantity,
  unitRaw: text,
});

const reviewReason: z.ZodType<ProcurementReviewReason> = z.enum([
  'missing_po', 'invalid_po', 'invalid_component_code', 'duplicate_identity',
  'supplier_conflict', 'quantity_unit_conflict', 'unresolved_history', 'no_confirmed_finished_line',
]);

export const ProcurementPreviewSelectionSchema: z.ZodType<ProcurementPreviewSelection | null> = nullable(strictObject({
  oa: z.string(),
  groups: z.array(strictObject({ oa: z.string(), count: z.number().int().positive() })),
  finishedRows: z.array(strictObject({
    source,
    oaRaw: text,
    oaRefs: z.array(oaRef),
    productCodeRaw: text,
    productNameRaw: text,
    poRaw: text,
    quantity,
  })),
  componentFacts: z.array(procurementFact),
  submission: optional(strictObject({
    originalBatchId: z.string(),
    finished: z.array(source.extend({ orderLineId: z.string() })),
    observations: z.array(source.extend({ materialLineId: text, reasons: z.array(reviewReason) })),
  })),
  links: z.array(strictObject({
    finishedRow: source,
    component: source,
    kind: z.enum(['direct', 'shared', 'group', 'candidate']),
  })),
}));

export { UNLINKED_PROCUREMENT, type ProcurementPreviewSelection, type ProcurementReviewReason };
