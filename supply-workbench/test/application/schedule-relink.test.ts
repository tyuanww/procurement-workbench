import { entityId, orderLineId } from '../../packages/domain/src/index.js';
import type { Actor } from '../../packages/application/src/shared/actor.js';
import { expect, it } from 'vitest';
import { makeRelinkFactoryRows, makeRelinkScheduleCells } from '../../packages/application/src/factory-links/index.js';
import { aParty, aPurchaseOrder, aUser, anOrderLine, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import { createPgFixture, queriesOf, type PgFixture } from './pg-fixtures.js';

const at = '2026-11-09T00:00:00.000Z';
const admin = (): Actor => ({ id: entityId('admin-1'), name: '管理员', roles: ['admin'] });

it('排产重跑只写活动排产格，已关联不改挂，六类重跑和数量都不变', async () => {
  const fixture = await createPgFixture();
  try {
    await seed(fixture);
    await insertShipment(fixture);
    const beforeFactory = await makeRelinkFactoryRows({ ...depsOf(fixture), links: queriesOf(fixture).links })({}, admin());
    expect(beforeFactory.factoryLinked).toBe(1);
    expect(rowsOf(await fixture.handle.exec(`select link_status from factory_schedule_cells where id = 'sched-a'`))[0]).toMatchObject({ link_status: 'unlinked' });
    const linksBefore = rowsOf(await fixture.handle.exec(`select id, order_line_id, status, factory_party_id from line_factory_links order by id`));

    const result = await makeRelinkScheduleCells({ ...depsOf(fixture), links: queriesOf(fixture).links })({}, admin());
    expect(result).toMatchObject({ linked: 3, ambiguous: 1, unlinked: 1, manual: 1, review: 1 });
    expect(rowsOf(await fixture.handle.exec(`select linked_order_line_id, link_status from factory_schedule_cells where id = 'sched-a'`))[0]).toMatchObject({ linked_order_line_id: 'line-1', link_status: 'linked' });
    expect(rowsOf(await fixture.handle.exec(`select linked_order_line_id, link_status from factory_schedule_cells where id = 'sched-b'`))[0]).toMatchObject({ linked_order_line_id: 'line-1', link_status: 'linked' });
    expect(rowsOf(await fixture.handle.exec(`select factory_party_id, linked_order_line_id from factory_schedule_cells where id = 'sched-c'`))[0]).toMatchObject({ factory_party_id: 'factory-2', linked_order_line_id: 'line-1' });
    const review = rowsOf(await fixture.handle.exec(`select linked_order_line_id, link_status, link_reason from factory_schedule_cells where id = 'sched-review'`))[0];
    expect(review).toMatchObject({ linked_order_line_id: 'line-1', link_status: 'linked', link_reason: 'SCHEDULE_LINK_REVIEW' });
    expect(rowsOf(await fixture.handle.exec(`select link_status, linked_order_line_id from factory_schedule_cells where id = 'sched-manual'`))[0]).toMatchObject({ link_status: 'manual', linked_order_line_id: 'line-1' });
    expect(rowsOf(await fixture.handle.exec(`select link_status from factory_schedule_cells where id = 'sched-amb'`))[0]).toMatchObject({ link_status: 'ambiguous' });
    expect(rowsOf(await fixture.handle.exec(`select link_status, link_reason from factory_schedule_cells where id = 'sched-old'`))[0]).toMatchObject({ link_status: 'unlinked', link_reason: null });
    expect(rowsOf(await fixture.handle.exec(`select qty, qty_required_total from factory_schedule_cells where id = 'sched-a'`))[0]).toMatchObject({ qty: '6.0000', qty_required_total: '100.0000' });
    expect(rowsOf(await fixture.handle.exec(`select qty_ordered from order_lines where id = 'line-1'`))[0]).toMatchObject({ qty_ordered: '10.0000' });
    expect(rowsOf(await fixture.handle.exec(`select id, order_line_id, status, factory_party_id from line_factory_links order by id`))).toEqual(linksBefore);
    const again = await makeRelinkScheduleCells({ ...depsOf(fixture), links: queriesOf(fixture).links })({}, admin());
    expect(again.review).toBe(1);
  } finally {
    await fixture.handle.close();
  }
});

async function seed(fixture: PgFixture): Promise<void> {
  await fixture.uow.run(async (tx) => {
    await tx.parties.save(aParty({ id: entityId('factory-1'), displayName: '宜侬', isSupplier: true, isFactory: true }));
    await tx.parties.save(aParty({ id: entityId('factory-2'), displayName: '另一厂', isSupplier: true, isFactory: true }));
    await tx.users.save(aUser({ id: entityId('admin-1'), name: '管理员', roles: ['admin'] }));
    await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-1'), poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER' }));
    await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-2'), poRaw: 'PO2', poNorm: 'PO2', poFormat: 'OTHER' }));
    await tx.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-dup'), poRaw: 'PODUP', poNorm: 'PODUP', poFormat: 'OTHER' }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-1'), purchaseOrderId: entityId('po-1'), qtyOrdered: 10 }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-2'), purchaseOrderId: entityId('po-2'), qtyOrdered: 10 }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-dup-1'), purchaseOrderId: entityId('po-dup'), itemCodeRaw: 'A' }));
    await tx.orderLines.save(anOrderLine({ id: orderLineId('line-dup-2'), purchaseOrderId: entityId('po-dup'), itemCodeRaw: 'B' }));
  });
  await batch(fixture, { id: 'batch-a', party: 'factory-1', source: 'factory-progress-v1:factory-1', superseded: false });
  await batch(fixture, { id: 'batch-b', party: 'factory-2', source: 'factory-progress-v1:factory-2', superseded: false });
  await batch(fixture, { id: 'batch-old', party: 'factory-1', source: 'factory-progress-v1:factory-1', superseded: true });
  await cell(fixture, { id: 'sched-a', batch: 'batch-a', party: 'factory-1', po: 'PO1', day: '2026-10-01', qty: 6, total: 100, status: 'unlinked', line: null });
  await cell(fixture, { id: 'sched-b', batch: 'batch-a', party: 'factory-1', po: 'PO1', day: '2026-10-02', qty: 6, total: 100, status: 'unlinked', line: null });
  await cell(fixture, { id: 'sched-c', batch: 'batch-b', party: 'factory-2', po: 'PO1', day: '2026-10-01', qty: 4, total: 4, status: 'unlinked', line: null });
  await cell(fixture, { id: 'sched-review', batch: 'batch-a', party: 'factory-1', po: 'PO2', day: '2026-10-03', qty: 1, total: 1, status: 'linked', line: 'line-1' });
  await cell(fixture, { id: 'sched-manual', batch: 'batch-a', party: 'factory-1', po: 'PO2', day: '2026-10-04', qty: 1, total: 1, status: 'manual', line: 'line-1' });
  await cell(fixture, { id: 'sched-amb', batch: 'batch-a', party: 'factory-1', po: 'PODUP', day: '2026-10-05', qty: 1, total: 1, status: 'unlinked', line: null });
  await cell(fixture, { id: 'sched-none', batch: 'batch-a', party: 'factory-1', po: null, day: '2026-10-06', qty: 1, total: 1, status: 'unlinked', line: null });
  await cell(fixture, { id: 'sched-old', batch: 'batch-old', party: 'factory-1', po: 'PO1', day: '2026-10-01', qty: 9, total: 9, status: 'unlinked', line: null });
}

async function batch(fixture: PgFixture, input: { readonly id: string; readonly party: string; readonly source: string; readonly superseded: boolean }): Promise<void> {
  const superseded = input.superseded ? `'${at}'` : 'null';
  await fixture.handle.exec(`insert into import_batches (
    id, created_at, updated_at, file_id, template, factory_party_id, status, coverage, source_key, source_fingerprint, effective_at, superseded_at, revision, file_meta, stats, decisions, created_by, committed_by, committed_at
  ) values (
    '${input.id}', '${at}', '${at}', 'file-${input.id}', 'factory-progress-v1', '${input.party}', 'committed', 'full_snapshot', '${input.source}', 'fp-${input.id}', '${at}', ${superseded}, 0, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'admin-1', 'admin-1', '${at}'
  )`);
}

async function cell(fixture: PgFixture, input: { readonly id: string; readonly batch: string; readonly party: string; readonly po: string | null; readonly day: string; readonly qty: number; readonly total: number; readonly status: string; readonly line: string | null }): Promise<void> {
  const raw = JSON.stringify({
    qtyRequiredTotal: { raw: String(input.total), value: input.total },
    day: input.day,
    qty: input.qty,
    po: input.po === null ? null : { raw: input.po, value: { poRaw: input.po, poNorm: input.po, poFormat: 'OTHER', relatedPoRaws: [] } },
  });
  await fixture.handle.exec(`insert into factory_schedule_cells (
    id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint, linked_order_line_id, link_status, link_reason, created_at, updated_at, po_raw, item_code_raw, name_raw, qty_required_total, day, qty
  ) values (
    '${input.id}', '${input.batch}', '${input.party}', '排产计划', 8, '${raw.replaceAll("'", "''")}'::jsonb, 'fp-${input.id}', ${input.line === null ? 'null' : `'${input.line}'`}, '${input.status}', null, '${at}', '${at}', ${input.po === null ? 'null' : `'${input.po}'`}, null, '海葡萄', ${input.total}, '${input.day}', ${input.qty}
  )`);
}

async function insertShipment(fixture: PgFixture): Promise<void> {
  await fixture.handle.exec(`insert into factory_shipment_rows (
    id, import_batch_id, factory_party_id, sheet_name, row_no, raw, fingerprint, link_status, created_at, updated_at, po_raw, po_norm, name_raw
  ) values (
    'ship-1', 'batch-a', 'factory-1', '成品出货明细', 2, '{}'::jsonb, 'ship-fp', 'unlinked', '${at}', '${at}', 'PO1', 'PO1', '海葡萄'
  )`);
}

function depsOf(fixture: PgFixture) {
  return { uow: fixture.uow, clock: new FixedClock(at), ids: new SequentialIds() };
}

function rowsOf(result: unknown): readonly Record<string, unknown>[] {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter((row: unknown): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
