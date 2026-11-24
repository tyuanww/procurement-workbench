import { entityId, orderLineId } from '../../packages/domain/src/index.js';
import type { Actor } from '../../packages/application/src/shared/actor.js';
import { expect, it } from 'vitest';
import {
  makeBackfillSupplierParties,
  makeGetLineFactoryLink,
  makeListUnmatchedFactoryRows,
  makeRelinkFactoryRows,
  makeSetLineFactoryLink,
  matchFactoryRow,
} from '../../packages/application/src/factory-links/index.js';
import { aParty, aPurchaseOrder, aUser, anOrderLine, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import { createPgFixture, queriesOf, type PgFixture } from './pg-fixtures.js';

const at = '2026-11-09T00:00:00.000Z';
const admin = (): Actor => ({ id: entityId('admin-1'), name: '管理员', roles: ['admin'] });

it('工厂匹配按 PO、品号、条码优先，多命中是冲突、无命中是未关联', () => {
  const lines = [
    lineRef({ orderLineId: 'line-1', poNorm: 'PO1', itemCodeNorm: null, barcodeNorm: null }),
    lineRef({ orderLineId: 'line-2', poNorm: 'PO2', itemCodeNorm: 'ITEM2', barcodeNorm: null }),
    lineRef({ orderLineId: 'line-3', poNorm: 'PO3', itemCodeNorm: 'ITEM3', barcodeNorm: 'BAR3' }),
    lineRef({ orderLineId: 'line-4', poNorm: 'PODUP', itemCodeNorm: 'ITEMX', barcodeNorm: null }),
    lineRef({ orderLineId: 'line-5', poNorm: 'PODUP', itemCodeNorm: 'ITEMY', barcodeNorm: null }),
  ];
  const byPo = matchFactoryRow(rowRef({ poNorm: 'PO1' }), lines);
  expect(byPo.kind).toBe('matched');
  if (byPo.kind === 'matched') expect(byPo.line.orderLineId).toBe('line-1');
  const byItem = matchFactoryRow(rowRef({ poNorm: 'PO-NONE', itemCodeNorm: 'ITEM2' }), lines);
  expect(byItem.kind).toBe('matched');
  if (byItem.kind === 'matched') expect(byItem.basis).toBe('item_code');
  const byBarcode = matchFactoryRow(rowRef({ itemCodeNorm: 'ITEM-NONE', barcodeNorm: 'BAR3' }), lines);
  expect(byBarcode.kind).toBe('matched');
  if (byBarcode.kind === 'matched') expect(byBarcode.line.orderLineId).toBe('line-3');
  const conflict = matchFactoryRow(rowRef({ poNorm: 'PODUP', itemCodeNorm: 'ITEM-NONE' }), lines);
  expect(conflict.kind).toBe('conflict');
  expect(matchFactoryRow(rowRef({}), lines).kind).toBe('none');
});

it('relink 用 PO/品号/条码写订单行关联和工厂行状态，重跑幂等', async () => {
  const fixture = await createPgFixture();
  try {
    await seedBase(fixture);
    await fixture.uow.run(async (tx) => {
      await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-1'), poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER' }));
      await tx.orderLines.save(anOrderLine({ id: orderLineId('line-1'), purchaseOrderId: entityId('po-1'), itemCodeRaw: 'ITEM1' }));
    });
    await insertShipment(fixture, { id: 'row-1', poNorm: 'PO1', poRaw: 'PO1', itemCodeRaw: 'ITEM-OTHER' });

    const relink = makeRelinkFactoryRows({ ...depsOf(fixture), links: queriesOf(fixture).links });
    const first = await relink({}, admin());
    expect(first).toMatchObject({ factoryRows: 1, factoryLinked: 1, factoryManual: 0, factoryUnlinked: 0, conflicts: 0, linesLinked: 1, linesUnlinked: 0 });
    expect(first.byBasis.po).toBe(1);
    const links = rowsOf(await fixture.handle.exec(`select order_line_id, factory_party_id, status, source, confidence from line_factory_links`));
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ order_line_id: 'line-1', factory_party_id: 'factory-1', status: 'linked', source: 'relink', confidence: 'po' });
    const row = rowsOf(await fixture.handle.exec(`select link_status, linked_order_line_id from factory_shipment_rows where id = 'row-1'`));
    expect(row[0]).toMatchObject({ link_status: 'linked', linked_order_line_id: 'line-1' });

    const second = await relink({}, admin());
    expect(second).toMatchObject({ factoryLinked: 1, linesLinked: 1, conflicts: 0 });
    expect(rowsOf(await fixture.handle.exec(`select id from line_factory_links`))).toHaveLength(1);
  } finally {
    await fixture.handle.close();
  }
});

it('relink 把多候选记成冲突、无候选记成未关联，并保留手工关联', async () => {
  const fixture = await createPgFixture();
  try {
    await seedBase(fixture);
    await fixture.uow.run(async (tx) => {
      await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-dup'), poRaw: 'PODUP', poNorm: 'PODUP', poFormat: 'OTHER' }));
      await tx.orderLines.save(anOrderLine({ id: orderLineId('line-dup-1'), purchaseOrderId: entityId('po-dup'), itemCodeRaw: 'ITEM-A' }));
      await tx.orderLines.save(anOrderLine({ id: orderLineId('line-dup-2'), purchaseOrderId: entityId('po-dup'), itemCodeRaw: 'ITEM-B' }));
      await tx.orderLines.save(anOrderLine({ id: orderLineId('line-manual'), purchaseOrderId: entityId('po-dup'), itemCodeRaw: 'ITEM-C' }));
    });
    await insertShipment(fixture, { id: 'row-conflict', poNorm: 'PODUP', poRaw: 'PODUP', itemCodeRaw: 'ITEM-NONE' });
    await insertShipment(fixture, { id: 'row-none', poNorm: null, poRaw: null, itemCodeRaw: null });
    await insertShipment(fixture, { id: 'row-manual', poNorm: 'PODUP', poRaw: 'PODUP', itemCodeRaw: 'ITEM-C' });
    await makeSetLineFactoryLink(depsOf(fixture))({ orderLineId: 'line-manual', factoryPartyId: 'factory-1' }, admin());
    const result = await makeRelinkFactoryRows({ ...depsOf(fixture), links: queriesOf(fixture).links })({}, admin());
    expect(result.conflicts).toBe(1);
    expect(result.factoryManual).toBe(0);
    expect(rowsOf(await fixture.handle.exec(`select link_status, link_reason from factory_shipment_rows where id = 'row-conflict'`))[0]).toMatchObject({ link_status: 'ambiguous', link_reason: 'FACTORY_LINK_CONFLICT' });
    expect(rowsOf(await fixture.handle.exec(`select link_status, link_reason from factory_shipment_rows where id = 'row-none'`))[0]).toMatchObject({ link_status: 'unlinked', link_reason: 'NO_CANDIDATE_LINE' });
    expect(rowsOf(await fixture.handle.exec(`select link_status, link_reason from factory_shipment_rows where id = 'row-manual'`))[0]).toMatchObject({ link_status: 'unlinked', link_reason: 'LINE_LINK_IS_MANUAL' });
    const manual = rowsOf(await fixture.handle.exec(`select status, source, factory_party_id from line_factory_links where order_line_id = 'line-manual'`));
    expect(manual[0]).toMatchObject({ status: 'manual', source: 'manual', factory_party_id: 'factory-1' });

    const unmatched = await makeListUnmatchedFactoryRows({ links: queriesOf(fixture).links })({}, admin());
    const reasons = unmatched.items.map((item) => item.reason);
    expect(reasons).toContain('FACTORY_LINK_CONFLICT');
    expect(reasons).toContain('NO_CANDIDATE_LINE');
    expect(unmatched.items.find((item) => item.reason === 'FACTORY_LINK_CONFLICT')?.suggestedAction).toContain('人工');

    await makeSetLineFactoryLink(depsOf(fixture))({ orderLineId: 'line-manual', factoryPartyId: null, reason: '人工确认取消' }, admin());
    await makeRelinkFactoryRows({ ...depsOf(fixture), links: queriesOf(fixture).links })({}, admin());
    expect(await makeGetLineFactoryLink({ links: queriesOf(fixture).links })({ orderLineId: 'line-manual' }, admin())).toMatchObject({ factory: null, status: 'unlinked', source: 'manual', reason: '人工确认取消' });
  } finally {
    await fixture.handle.close();
  }
});

it('读路径优先用显式工厂关联，再回退到活动工厂进度行', async () => {
  const fixture = await createPgFixture();
  try {
    await seedBase(fixture);
    await fixture.uow.run(async (tx) => {
      await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-1'), poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER' }));
      await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-2'), poRaw: 'PO2', poNorm: 'PO2', poFormat: 'OTHER' }));
      await tx.orderLines.save(anOrderLine({ id: orderLineId('line-1'), purchaseOrderId: entityId('po-1') }));
      await tx.orderLines.save(anOrderLine({ id: orderLineId('line-2'), purchaseOrderId: entityId('po-2') }));
      await tx.orderLines.save(anOrderLine({ id: orderLineId('line-3'), purchaseOrderId: entityId('po-2') }));
    });
    await insertShipment(fixture, { id: 'row-1', poNorm: 'PO1', poRaw: 'PO1', itemCodeRaw: null, linkedOrderLineId: 'line-1', linkStatus: 'linked' });
    const getLink = makeGetLineFactoryLink({ links: queriesOf(fixture).links });
    const fallback = await getLink({ orderLineId: 'line-1' }, { id: entityId('buyer-1'), name: '采购', roles: ['buyer'] });
    expect(fallback).toMatchObject({ orderLineId: 'line-1', status: 'linked', source: 'factory_progress' });
    expect(fallback?.factory).toMatchObject({ id: 'factory-1', displayName: '宜侬' });

    await makeSetLineFactoryLink(depsOf(fixture))({ orderLineId: 'line-2', factoryPartyId: 'factory-1' }, admin());
    await makeRelinkFactoryRows({ ...depsOf(fixture), links: queriesOf(fixture).links })({}, admin());
    expect(await getLink({ orderLineId: 'line-2' }, { id: entityId('buyer-1'), name: '采购', roles: ['buyer'] })).toMatchObject({ status: 'manual', source: 'manual' });
    expect(await getLink({ orderLineId: 'line-3' }, { id: entityId('buyer-1'), name: '采购', roles: ['buyer'] })).toMatchObject({ status: 'unlinked', source: 'relink', reason: 'NO_FACTORY_ROW_MATCH' });
    expect(await getLink({ orderLineId: 'line-none' }, { id: entityId('buyer-1'), name: '采购', roles: ['buyer'] })).toBeUndefined();
  } finally {
    await fixture.handle.close();
  }
});

it('已审批供应商别名回填采购单 supplier_party_id，且幂等', async () => {
  const fixture = await createPgFixture();
  try {
    await fixture.uow.run(async (tx) => {
      await tx.parties.save(aParty({ id: entityId('supplier-1'), displayName: '宜侬', isSupplier: true, isFactory: false }));
      await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-1'), poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER', supplierRaw: ' 宜侬 ', supplierPartyId: null }));
      await tx.aliases.save({ id: entityId('alias-1'), createdAt: at, updatedAt: at, rawName: '宜侬', normName: '宜侬', partyId: entityId('supplier-1'), status: 'approved', firstSeenImportBatchId: null, seenCount: 1, seenBatchCount: 1, reviewedBy: entityId('admin-1'), reviewedAt: at });
    });
    const backfill = makeBackfillSupplierParties({ ...depsOf(fixture), links: queriesOf(fixture).links });
    expect(await backfill({}, admin())).toEqual({ updated: 1 });
    expect(rowsOf(await fixture.handle.exec(`select supplier_party_id from purchase_orders where id = 'po-1'`))[0]?.supplier_party_id).toBe('supplier-1');
    expect(await backfill({}, admin())).toEqual({ updated: 0 });
  } finally {
    await fixture.handle.close();
  }
});

async function seedBase(fixture: PgFixture): Promise<void> {
  await fixture.uow.run(async (tx) => {
    await tx.parties.save(aParty({ id: entityId('factory-1'), displayName: '宜侬', isSupplier: true, isFactory: true }));
    await tx.users.save(aUser({ id: entityId('admin-1'), name: '管理员', roles: ['admin'] }));
  });
  await fixture.handle.exec(`insert into import_batches (
    id, created_at, updated_at, file_id, template, factory_party_id, status,
    file_meta, stats, decisions, created_by, committed_by, committed_at
  ) values (
    'batch-1', '${at}', '${at}', '工厂进度.xlsx', 'factory-progress-v1', 'factory-1', 'committed',
    '{}', '{}', '{}', 'admin-1', 'admin-1', '${at}'
  )`);
}

async function insertShipment(fixture: PgFixture, row: {
  readonly id: string;
  readonly poNorm: string | null;
  readonly poRaw: string | null;
  readonly itemCodeRaw: string | null;
  readonly linkedOrderLineId?: string | null;
  readonly linkStatus?: string;
}): Promise<void> {
  const raw = {
    po: row.poRaw === null || row.poNorm === null ? null : { value: { poRaw: row.poRaw, poNorm: row.poNorm, poFormat: 'OTHER', relatedPoRaws: [] } },
    itemCodeRaw: row.itemCodeRaw === null ? null : { value: row.itemCodeRaw },
    nameRaw: { value: '海葡萄' },
  };
  await fixture.handle.exec(`insert into factory_shipment_rows (
    id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint, linked_order_line_id, link_status, link_reason,
    created_at, updated_at, po_raw, po_norm, item_code_raw, name_raw
  ) values (
    '${row.id}', 'batch-1', 'factory-1', '出货明细', 2, ${sqlText(JSON.stringify(raw))}::jsonb, 'fp-${row.id}', ${sqlText(row.linkedOrderLineId ?? null)}, '${row.linkStatus ?? 'unlinked'}', null,
    '2026-11-08T00:00:00Z', '2026-11-08T00:00:00Z', ${sqlText(row.poRaw)}, ${sqlText(row.poNorm)}, ${sqlText(row.itemCodeRaw)}, '海葡萄'
  )`);
}

function lineRef(input: { readonly orderLineId: string; readonly poNorm: string | null; readonly itemCodeNorm: string | null; readonly barcodeNorm: string | null }) {
  return { ...input, linkId: null, linkStatus: null, linkReason: null };
}

function rowRef(input: { readonly poNorm?: string | null; readonly itemCodeNorm?: string | null; readonly barcodeNorm?: string | null }) {
  return {
    rowId: 'row-1',
    kind: 'shipment' as const,
    factoryPartyId: 'factory-1',
    poNorm: input.poNorm ?? null,
    itemCodeNorm: input.itemCodeNorm ?? null,
    barcodeNorm: input.barcodeNorm ?? null,
    poRaw: null,
    itemCodeRaw: null,
    barcodeRaw: null,
    linkStatus: 'unlinked',
    linkReason: null,
    linkedOrderLineId: null,
  };
}

function depsOf(fixture: PgFixture) {
  return { uow: fixture.uow, clock: new FixedClock(at), ids: new SequentialIds() };
}

function sqlText(value: string | null): string {
  return value === null ? 'null' : `'${value.replaceAll("'", "''")}'`;
}

function rowsOf(result: unknown): readonly Record<string, unknown>[] {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter((row: unknown): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
