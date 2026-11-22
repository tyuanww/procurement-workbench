import { z } from 'zod';
import { strictObject } from './shape.js';

export const OwnerAssignmentSourceSchema = z.enum(['po_master', 'mapping_import', 'manual']);
export type OwnerAssignmentSource = z.infer<typeof OwnerAssignmentSourceSchema>;

export const OwnerAssignmentStatusSchema = z.enum(['assigned', 'pending']);
export type OwnerAssignmentStatus = z.infer<typeof OwnerAssignmentStatusSchema>;

export const OwnerCoverageSchema = strictObject({
  /** 订单行总数；采购员范围里是自己的行数。 */
  total: z.number().int().nonnegative(),
  assigned: z.number().int().nonnegative(),
  unassigned: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
});
export type OwnerCoverage = z.infer<typeof OwnerCoverageSchema>;

export const OwnerUserRefSchema = strictObject({ id: z.string(), name: z.string() });

export const LineOwnerOptionsSchema = z.array(OwnerUserRefSchema);

export const OwnerAssignmentViewSchema = strictObject({
  lineId: z.string(),
  status: OwnerAssignmentStatusSchema,
  source: OwnerAssignmentSourceSchema,
  owner: z.union([OwnerUserRefSchema, z.null()]),
  ownerNameRaw: z.union([z.string(), z.null()]),
  effectiveAt: z.string(),
});
export type OwnerAssignmentView = z.infer<typeof OwnerAssignmentViewSchema>;

export const PendingOwnerViewSchema = strictObject({
  id: z.string(),
  lineId: z.string(),
  nameRaw: z.string(),
  source: OwnerAssignmentSourceSchema,
  effectiveAt: z.string(),
});
export type PendingOwnerView = z.infer<typeof PendingOwnerViewSchema>;

export const PendingOwnerListSchema = strictObject({ items: z.array(PendingOwnerViewSchema) });
export type PendingOwnerList = z.infer<typeof PendingOwnerListSchema>;

export const AssignOwnerRequestSchema = strictObject({
  lineIds: z.array(z.string()).min(1),
  ownerUserId: z.string(),
});
export type AssignOwnerRequest = z.infer<typeof AssignOwnerRequestSchema>;

export const ResolvePendingOwnerRequestSchema = strictObject({
  ownerNameRaw: z.string(),
  ownerUserId: z.string(),
});
export type ResolvePendingOwnerRequest = z.infer<typeof ResolvePendingOwnerRequestSchema>;

export const OwnerUpdatedSchema = strictObject({ updated: z.number().int().nonnegative() });
export type OwnerUpdated = z.infer<typeof OwnerUpdatedSchema>;
