import { expect, it } from 'vitest';
import {
  AssignOwnerRequestSchema,
  OwnerAssignmentViewSchema,
  OwnerCoverageSchema,
  PendingOwnerListSchema,
  ResolvePendingOwnerRequestSchema,
} from '../../packages/contracts/src/owner-views.js';
import {
  FactoryLinkCountsSchema,
  LineFactoryLinkViewSchema,
  RelinkFactoryRowsResultSchema,
  SetLineFactoryLinkRequestSchema,
  UnmatchedFactoryRowViewSchema,
} from '../../packages/contracts/src/factory-link-views.js';

it('ownerCoverage 契约要求 total/assigned/unassigned/pending 四个字段', () => {
  const coverage = { total: 606, assigned: 1, unassigned: 599, pending: 6 };
  expect(OwnerCoverageSchema.parse(coverage)).toEqual(coverage);
  expect(OwnerCoverageSchema.safeParse({ total: 1, assigned: 0, unassigned: 0 }).success).toBe(false);
  expect(OwnerCoverageSchema.safeParse({ ...coverage, extra: 1 }).success).toBe(false);
  expect(OwnerCoverageSchema.safeParse({ ...coverage, pending: -1 }).success).toBe(false);
});

it('负责人指派和待审核契约', () => {
  expect(AssignOwnerRequestSchema.parse({ lineIds: ['line-1'], ownerUserId: 'user-1' })).toEqual({ lineIds: ['line-1'], ownerUserId: 'user-1' });
  expect(AssignOwnerRequestSchema.safeParse({ lineIds: [], ownerUserId: 'user-1' }).success).toBe(false);
  expect(ResolvePendingOwnerRequestSchema.parse({ ownerNameRaw: '查无此人', ownerUserId: 'user-1' })).toEqual({ ownerNameRaw: '查无此人', ownerUserId: 'user-1' });
  expect(OwnerAssignmentViewSchema.parse({ lineId: 'line-1', status: 'pending', source: 'po_master', owner: null, ownerNameRaw: '查无此人', effectiveAt: '2026-11-09T00:00:00.000Z' })).toMatchObject({ status: 'pending', owner: null });
  expect(OwnerAssignmentViewSchema.safeParse({ lineId: 'line-1', status: 'weird', source: 'po_master', owner: null, ownerNameRaw: null, effectiveAt: 'x' }).success).toBe(false);
  expect(PendingOwnerListSchema.parse({ items: [{ id: 'a1', lineId: 'line-1', nameRaw: '查无此人', source: 'po_master', effectiveAt: '2026-11-09T00:00:00.000Z' }] }).items).toHaveLength(1);
});

it('工厂关联视图契约区分 linked/unlinked/manual 与匹配依据', () => {
  const linked = { orderLineId: 'line-1', factory: { id: 'factory-1', displayName: '宜侬' }, status: 'linked', source: 'relink', confidence: 'po', reason: null, linkedAt: '2026-11-09T00:00:00.000Z' };
  expect(LineFactoryLinkViewSchema.parse(linked)).toEqual(linked);
  const unlinked = { ...linked, factory: null, status: 'unlinked', source: 'relink', confidence: 'none', reason: 'NO_FACTORY_ROW_MATCH' };
  expect(LineFactoryLinkViewSchema.parse(unlinked)).toEqual(unlinked);
  expect(LineFactoryLinkViewSchema.safeParse({ ...linked, confidence: 'guess' }).success).toBe(false);
  expect(FactoryLinkCountsSchema.parse({ linked: 7000, manual: 2, unlinked: 337 })).toEqual({ linked: 7000, manual: 2, unlinked: 337 });
  expect(SetLineFactoryLinkRequestSchema.parse({ factoryPartyId: null, reason: '供应商从宜侬切到别家' })).toEqual({ factoryPartyId: null, reason: '供应商从宜侬切到别家' });
  expect(SetLineFactoryLinkRequestSchema.safeParse({ reason: '缺主体字段' }).success).toBe(false);
});

it('relink 和未匹配导出契约', () => {
  const result = {
    factoryRows: 7339,
    factoryLinked: 7000,
    factoryManual: 2,
    factoryUnlinked: 337,
    conflicts: 337,
    linesLinked: 606,
    linesUnlinked: 0,
    byBasis: { po: 6800, item_code: 150, barcode: 50 },
  };
  expect(RelinkFactoryRowsResultSchema.parse(result)).toEqual(result);
  expect(RelinkFactoryRowsResultSchema.safeParse({ ...result, byBasis: { po: 1 } }).success).toBe(false);
  const unmatched = { rowId: 'row-1', kind: 'shipment', factoryPartyId: 'factory-1', poRaw: 'PO1', itemCodeRaw: null, barcodeRaw: null, reason: 'FACTORY_LINK_CONFLICT', suggestedAction: '按 PO、品号、条码人工选定订单行' };
  expect(UnmatchedFactoryRowViewSchema.parse(unmatched)).toEqual(unmatched);
});
