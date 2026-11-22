import { z } from 'zod';
import type { Arrival, ArrivalAllocation, ArrivalCandidate, RegisterArrivalInput, ReviseArrivalInput } from '@sw/application';
import { ReceiptCategorySchema } from './enums.js';
import { DeliveryBatchIdSchema, EntityIdSchema, LocalDateSchema, OrderLineIdSchema, listResponseSchema } from './values.js';
import { nullable, optional, strictObject } from './shape.js';

const shortText = z.string().trim().min(1).max(160);
const evidence = z.string().trim().min(1).max(500);
const qty = z.number().positive().max(100_000_000_000).refine((value) => Number(value.toFixed(4)) === value, '数量最多四位小数');
const unit = z.string().trim().min(1).max(64);
const referenceFields = { source: shortText, number: shortText, row: shortText };
const document = strictObject({ kind: z.literal('document'), ...referenceFields });
const reference = z.discriminatedUnion('kind', [
  document,
  strictObject({ kind: z.literal('ledger'), ...referenceFields }),
]);

export const RegisterArrivalSchema = strictObject({
  source: reference,
  warehouseId: EntityIdSchema,
  receivedOn: LocalDateSchema,
  itemCode: shortText,
  qty,
  unit,
}) satisfies z.ZodType<RegisterArrivalInput>;

const allocationInput = strictObject({
  batchId: DeliveryBatchIdSchema,
  poNumber: shortText,
  poLine: shortText,
  targetLineId: optional(OrderLineIdSchema),
  evidence,
  qty,
  category: ReceiptCategorySchema,
});

const count = strictObject({ document, qty, unit, conversionEvidence: nullable(evidence) });
const MAX_SQL_REVISION = 2_147_483_647;
const revision = z.number().int().nonnegative().max(MAX_SQL_REVISION);
const expectedRevision = revision.max(MAX_SQL_REVISION - 1);

export const ReviseArrivalSchema = z.discriminatedUnion('kind', [
  strictObject({
    kind: z.literal('allocate'),
    expectedRevision,
    reason: nullable(evidence),
    count,
    allocations: z.array(allocationInput).min(1).max(50),
  }),
  strictObject({ kind: z.literal('rollback'), expectedRevision, reason: evidence }),
]) satisfies z.ZodType<ReviseArrivalInput>;

const allocation = allocationInput.extend({ lineId: OrderLineIdSchema, receiptId: EntityIdSchema }) satisfies z.ZodType<ArrivalAllocation>;
export const ArrivalSchema: z.ZodType<Arrival> = RegisterArrivalSchema.extend({
  id: EntityIdSchema,
  revision,
  registeredAt: z.string(),
  registeredBy: EntityIdSchema,
  allocation: nullable(strictObject({ count, rows: z.array(allocation), by: EntityIdSchema, at: z.string() })),
});
export const ArrivalListSchema = listResponseSchema(ArrivalSchema);

const candidate = strictObject({
  lineId: OrderLineIdSchema,
  poNumber: nullable(z.string()),
  itemName: nullable(z.string()),
  needsLineConfirmation: z.boolean(),
  source: nullable(strictObject({ importBatchId: z.string(), sheet: z.string(), rowNo: z.number().int().positive() })),
  batch: nullable(strictObject({ id: DeliveryBatchIdSchema, seq: z.number(), plannedQty: z.number(), unit: nullable(z.string()), confirmedOn: nullable(LocalDateSchema), canAllocate: z.boolean() })),
}) satisfies z.ZodType<ArrivalCandidate>;
export const ArrivalDetailSchema = strictObject({ arrival: ArrivalSchema, candidates: z.array(candidate).readonly() });
export type { Arrival, ArrivalAllocation, ArrivalCandidate, RegisterArrivalInput, ReviseArrivalInput };
