import { FULFILLMENT_REVIEW_REASONS, RECEIPT_DISPOSITIONS } from '@sw/domain';
import { z } from 'zod';
import { nullable, optional, strictObject } from './shape.js';

const sourceEvidence = {
  unit: nullable(z.string().trim().min(1).max(64)),
  evidence: z.string().trim().min(1).max(1000),
};
const reported = strictObject({ ...sourceEvidence, kind: z.literal('reported') });
const verified = strictObject({ ...sourceEvidence, kind: z.literal('verified'), reportId: optional(z.string().min(1)) });

export const ShipmentEvidenceInputSchema = z.discriminatedUnion('kind', [reported, verified]);
export const ReceiptEvidenceInputSchema = strictObject({
  ...sourceEvidence,
  kind: z.literal('received'),
  disposition: z.enum(RECEIPT_DISPOSITIONS),
});

const review = nullable(z.enum(FULFILLMENT_REVIEW_REASONS));
export const ShipmentEvidenceSchema = z.discriminatedUnion('kind', [reported, verified.extend({ reviewReason: review })]);
export const ReceiptEvidenceSchema = ReceiptEvidenceInputSchema.extend({
  reviewReason: review,
  arrival: optional(strictObject({ arrivalId: z.string(), revision: z.number().int().positive() })),
});

export const BatchFulfillmentSchema = strictObject({
  unit: nullable(z.string()),
  unshippedQty: nullable(z.number()),
  inTransitQty: nullable(z.number()),
  receivedQty: nullable(z.number()),
  verifiedShippedQty: z.number(),
  verifiedReceivedQty: z.number(),
  overShippedQty: z.number(),
  overReceivedQty: z.number(),
  receiptWithoutShipmentQty: z.number(),
  reviewCount: z.number(),
});
