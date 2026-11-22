import { expect, it } from 'vitest';
import { localDate } from '@sw/domain';
import { createDb, migrate, seed, todayQueries } from '@sw/persistence';

const AT = '2026-11-17T04:00:00.000Z';
const BUYER = '0199f0a0-0000-7000-8000-000000000002';
const WAREHOUSE = '0199f0a0-0000-7000-8000-000000000010';

it('按批次分组后仍排除作废行，并且两个批次的数量不混', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  await handle.exec(twoBatchSql());
  const catalog = await todayQueries({
    db: handle.db,
    timeZone: 'Asia/Shanghai',
  }).loadCatalog(localDate('2026-11-17'));
  const left = catalog.sources.find((source) => source.id === 'grp-batch-a');
  const right = catalog.sources.find((source) => source.id === 'grp-batch-b');
  const leftView = catalog.batches.find((batch) => batch.id === 'grp-batch-a');
  const rightView = catalog.batches.find((batch) => batch.id === 'grp-batch-b');
  expect(left?.shipments.map((row) => row.qty)).toEqual([2, 3]);
  expect(left?.receipts.map((row) => row.qty)).toEqual([4]);
  expect(left?.noteStatus).toBe('missing');
  expect(right?.shipments.map((row) => row.qty)).toEqual([5]);
  expect(right?.noteStatus).toBe('returned');
  expect(leftView).toMatchObject({ shippedQty: 5, receivedQty: 4, noteStatus: 'missing' });
  expect(rightView).toMatchObject({ shippedQty: 5, receivedQty: 0, noteStatus: 'returned' });
  const empty = catalog.sources.find((source) => source.id === 'grp-batch-c');
  const emptyView = catalog.batches.find((batch) => batch.id === 'grp-batch-c');
  expect(empty?.shipments).toEqual([]);
  expect(empty?.noteStatus).toBe('missing');
  expect(emptyView).toMatchObject({ shippedQty: 0, receivedQty: 0, noteStatus: 'missing' });
  await handle.close();
});

function twoBatchSql(): string {
  return `
    insert into purchase_orders (id, created_at, updated_at, po_raw, po_format, related_po_raws, lane)
    values ('grp-po-a', '${AT}', '${AT}', 'SYN-A', 'OTHER', array[]::text[], 'finished'),
           ('grp-po-b', '${AT}', '${AT}', 'SYN-B', 'OTHER', array[]::text[], 'finished'),
           ('grp-po-c', '${AT}', '${AT}', 'SYN-C', 'OTHER', array[]::text[], 'finished');
    insert into order_lines (id, created_at, updated_at, purchase_order_id, lane, name_raw, qty_ordered, buyer_user_id, receiver_party_id, origin, missing_in_latest_import, latest_import_presence, stage, stage_changed_at)
    values ('grp-line-a', '${AT}', '${AT}', 'grp-po-a', 'finished', '分组甲', 10, '${BUYER}', '${WAREHOUSE}', 'manual', false, 'not_applicable', 'awaiting_shipment', '${AT}'),
           ('grp-line-b', '${AT}', '${AT}', 'grp-po-b', 'finished', '分组乙', 10, '${BUYER}', '${WAREHOUSE}', 'manual', false, 'not_applicable', 'awaiting_shipment', '${AT}'),
           ('grp-line-c', '${AT}', '${AT}', 'grp-po-c', 'finished', '分组丙', 10, '${BUYER}', '${WAREHOUSE}', 'manual', false, 'not_applicable', 'awaiting_shipment', '${AT}');
    insert into delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, receiver_party_id, date_buyer_confirmed, first_confirmed_date, status, status_changed_at, origin)
    values ('grp-batch-a', '${AT}', '${AT}', 'grp-line-a', 1, 10, '${WAREHOUSE}', '2026-11-10', '2026-11-10', 'confirmed', '${AT}', 'manual'),
           ('grp-batch-b', '${AT}', '${AT}', 'grp-line-b', 1, 10, '${WAREHOUSE}', '2026-11-10', '2026-11-10', 'confirmed', '${AT}', 'manual'),
           ('grp-batch-c', '${AT}', '${AT}', 'grp-line-c', 1, 10, '${WAREHOUSE}', '2026-11-10', '2026-11-10', 'confirmed', '${AT}', 'manual');
    insert into shipments (id, created_at, updated_at, batch_id, qty, shipped_on, source, created_by, voided_at)
    values ('grp-ship-a1', '${AT}', '${AT}', 'grp-batch-a', 2, '2026-11-12', 'manual', '${BUYER}', null),
           ('grp-ship-a-void', '${AT}', '${AT}', 'grp-batch-a', 9, '2026-11-12', 'manual', '${BUYER}', '${AT}'),
           ('grp-ship-a2', '${AT}', '${AT}', 'grp-batch-a', 3, '2026-11-13', 'manual', '${BUYER}', null),
           ('grp-ship-b', '${AT}', '${AT}', 'grp-batch-b', 5, '2026-11-12', 'manual', '${BUYER}', null);
    insert into receipts (id, created_at, updated_at, batch_id, qty, received_on, category, source, created_by, voided_at)
    values ('grp-rcpt-a', '${AT}', '${AT}', 'grp-batch-a', 4, '2026-11-13', 'finished', 'manual', '${BUYER}', null),
           ('grp-rcpt-a-void', '${AT}', '${AT}', 'grp-batch-a', 8, '2026-11-13', 'finished', 'manual', '${BUYER}', '${AT}');
    insert into delivery_notes (id, created_at, updated_at, batch_id, status, created_by, voided_at)
    values ('grp-note-a-void', '${AT}', '${AT}', 'grp-batch-a', 'verified', '${BUYER}', '${AT}'),
           ('grp-note-a', '${AT}', '${AT}', 'grp-batch-a', 'missing', '${BUYER}', null),
           ('grp-note-a-later', '${AT}', '${AT}', 'grp-batch-a', 'verified', '${BUYER}', null),
           ('grp-note-b', '${AT}', '${AT}', 'grp-batch-b', 'returned', '${BUYER}', null);
  `;
}
