import { PROCUREMENT_STORES } from '@sw/domain';
import type { StoreProgressLine, StoreProgressMaterial } from '@sw/application';
import { z } from 'zod';
import { nullable, strictObject } from './shape.js';

export type { ProcurementStore } from '@sw/domain';
export type { StoreProgressLine, StoreProgressMaterial } from '@sw/application';

export const ProcurementStoreSchema = z.enum(PROCUREMENT_STORES);
const text = nullable(z.string());
const source = strictObject({
  importBatchId: z.string(),
  sheetName: z.string(),
  rowNo: z.number().int().positive(),
});
const material: z.ZodType<StoreProgressMaterial> = strictObject({
  id: z.string(),
  nameRaw: text,
  codeRaw: text,
  poRaw: text,
  source,
  completed: z.boolean(),
  quantity: nullable(z.number()),
  unit: text,
  deliveryProgressRaw: text,
  reportedGap: nullable(z.number()),
});

export const StoreProgressLineSchema: z.ZodType<StoreProgressLine> = strictObject({
  store: ProcurementStoreSchema.exclude(['all']),
  sources: z.array(source.extend({ oaRaw: text })),
  materials: z.array(material),
});
