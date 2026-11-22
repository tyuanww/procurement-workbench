import {
  parseDeliveryBatchId,
  parseEntityId,
  parseLocalDate,
  parseOrderLineId,
  parseProductId,
  type DeliveryBatchId,
  type EntityId,
  type LocalDate,
  type Missing,
  type OrderLineId,
  type ProductId,
  type Provenance,
  type Provenanced,
} from '@sw/domain';
import { z } from 'zod';
import { MissingReasonSchema, TemplateIdSchema } from './enums.js';
import { nullable, optional, strictObject } from './shape.js';

export const LocalDateSchema: z.ZodType<LocalDate, string> = z.string().transform((input, ctx) => {
  const parsed = parseLocalDate(input);
  if (!parsed.ok) {
    ctx.addIssue({ code: 'custom', message: '不是有效的业务日期' });
    return z.NEVER;
  }
  return parsed.value;
});

function idSchema<Id extends EntityId>(parse: (input: string) => { readonly ok: true; readonly value: Id } | { readonly ok: false }, message: string): z.ZodType<Id, string> {
  return z.string().transform((input, ctx) => {
    const parsed = parse(input);
    if (!parsed.ok) {
      ctx.addIssue({ code: 'custom', message });
      return z.NEVER;
    }
    return parsed.value;
  });
}

export const EntityIdSchema = idSchema((input) => parseEntityId(input), '不是有效的 id');
export const OrderLineIdSchema = idSchema((input) => parseOrderLineId(input), '不是有效的订单行 id');
export const ProductIdSchema = idSchema((input) => parseProductId(input), '不是有效的产品 id');
export const DeliveryBatchIdSchema = idSchema((input) => parseDeliveryBatchId(input), '不是有效的批次 id');

export const ProvenanceSchema: z.ZodType<Provenance> = z.discriminatedUnion('kind', [
  strictObject({ kind: z.literal('manual'), by: z.string(), at: z.string() }),
  strictObject({
    kind: z.literal('import'),
    importBatchId: z.string(),
    template: TemplateIdSchema,
    sheet: z.string(),
    rowNo: z.number(),
    at: z.string(),
  }),
  strictObject({
    kind: z.literal('factory_report'),
    importBatchId: z.string(),
    factoryPartyId: z.string(),
    sheet: z.string(),
    rowNo: z.number(),
    at: z.string(),
  }),
  strictObject({ kind: z.literal('system'), rule: z.string(), at: z.string() }),
]);

export const MissingSchema: z.ZodType<Missing> = strictObject({
  value: z.null(),
  reason: MissingReasonSchema,
  raw: optional(z.string()),
});

export function provenancedSchema<T>(value: z.ZodType<T>): z.ZodType<Provenanced<T>> {
  return strictObject({
    value: nullable(value),
    missingReason: optional(MissingReasonSchema),
    raw: optional(z.string()),
    provenance: ProvenanceSchema,
  });
}

export type Page = {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
};

export type ListResponse<T> = {
  readonly items: readonly T[];
  readonly page: Page;
};

export const PageSchema: z.ZodType<Page> = strictObject({
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
});

export function listResponseSchema<T>(item: z.ZodType<T>): z.ZodType<ListResponse<T>> {
  return strictObject({
    items: z.array(item),
    page: PageSchema,
  });
}

export type { DeliveryBatchId, EntityId, LocalDate, Missing, OrderLineId, ProductId, Provenance, Provenanced };
