import { expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import { makeGetStuckBatches } from '../../packages/application/src/performance/index.js';
import { aUser } from '../../packages/testkit/src/index.js';
import { createDb } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { performanceQueries } from '../../packages/persistence/src/queries/performance/index.js';
import { todayQueries } from '../../packages/persistence/src/queries/today/index.js';

const today = localDate('2026-10-12');
const actor = aUser({ roles: ['manager'] });

it('卡点和今日读取同一批次的实物数量，区分催工厂、等回单和数量待核', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    const at = '2026-10-12T00:00:00.000Z';
    await handle.exec(`
      insert into parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse)
      values ('supplier', '${at}', '${at}', '样例工厂', true, true, false), ('warehouse', '${at}', '${at}', '样例仓', false, false, true);
      insert into purchase_orders (id, created_at, updated_at, po_raw, po_format, related_po_raws, supplier_party_id, lane)
      values ('po-delivery', '${at}', '${at}', 'PO-D', 'OTHER', '{}', 'supplier', 'finished');
    `);
    await handle.exec(`insert into order_lines (id, created_at, updated_at, purchase_order_id, lane, origin, missing_in_latest_import, stage, stage_changed_at) values ('line-delivery', '${at}', '${at}', 'po-delivery', 'finished', 'manual', false, 'awaiting_shipment', '${at}')`);
    await handle.exec(`
      insert into delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, planned_unit, receiver_party_id, status, status_changed_at, origin)
      values ('batch-date', '${at}', '${at}', 'line-delivery', 1, 600, '件', 'warehouse', 'awaiting_date', '${at}', 'manual'),
        ('batch-partial', '${at}', '${at}', 'line-delivery', 2, 1000, '件', 'warehouse', 'partially_received', '${at}', 'manual'),
        ('batch-note', '${at}', '${at}', 'line-delivery', 3, 800, '件', 'warehouse', 'shipped', '${at}', 'manual'),
        ('batch-legacy', '${at}', '${at}', 'line-delivery', 4, 800, '件', 'warehouse', 'shipped', '${at}', 'manual');
      update delivery_batches set date_buyer_confirmed = '2026-10-13' where id = 'batch-partial';
      insert into shipments (id, created_at, updated_at, batch_id, qty, shipped_on, source, created_by, fulfillment)
      values ('partial-sent', '${at}', '${at}', 'batch-partial', 500, '2026-10-12', 'manual', 'buyer-1', '{"kind":"verified","unit":"件","evidence":"合成交运单","reviewReason":null}'),
        ('note-sent', '${at}', '${at}', 'batch-note', 800, '2026-10-12', 'manual', 'buyer-1', '{"kind":"verified","unit":"件","evidence":"合成交运单","reviewReason":null}'),
        ('legacy-sent', '${at}', '${at}', 'batch-legacy', 800, '2026-10-12', 'manual', 'buyer-1', null);
      insert into receipts (id, created_at, updated_at, batch_id, qty, received_on, category, source, created_by, fulfillment)
      values ('partial-received', '${at}', '${at}', 'batch-partial', 200, '2026-10-12', 'normal', 'manual', 'buyer-1', '{"kind":"received","unit":"件","evidence":"合成收货单","disposition":"normal","reviewReason":null}');
      insert into delivery_notes (id, created_at, updated_at, batch_id, status, returned_on, created_by)
      values ('legacy-note', '${at}', '${at}', 'batch-legacy', 'returned', '2026-10-12', 'buyer-1');
    `);

    const performance = performanceQueries({ db: handle.db, clock: { today: () => today }, timeZone: 'Asia/Shanghai' });
    const catalog = await todayQueries({ db: handle.db, timeZone: 'Asia/Shanghai' }).loadCatalog(today);
    const stuck = await makeGetStuckBatches({ performance })({ from: today, to: today }, actor);
    for (const item of stuck.items) expect(item.fulfillment).toEqual(catalog.batches.find((batch) => batch.id === item.batchId)?.fulfillment);
    expect(stuck.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ batchId: 'batch-date', waitingOn: { kind: 'supplier', partyId: 'supplier', displayName: '样例工厂', reason: 'supplier_date' }, fulfillment: expect.objectContaining({ unit: '件', unshippedQty: 600, inTransitQty: 0, receivedQty: 0 }) }),
      expect.objectContaining({ batchId: 'batch-partial', waitingOn: expect.objectContaining({ reason: 'supplier_shipment' }), fulfillment: expect.objectContaining({ unit: '件', unshippedQty: 500, inTransitQty: 300, receivedQty: 200 }) }),
      expect.objectContaining({ batchId: 'batch-note', waitingOn: expect.objectContaining({ kind: 'internal', reason: 'internal_note' }), fulfillment: expect.objectContaining({ unshippedQty: 0, inTransitQty: 800, receivedQty: 0 }) }),
      expect.objectContaining({ batchId: 'batch-legacy', waitingOn: expect.objectContaining({ kind: 'internal', reason: 'internal_review' }), fulfillment: expect.objectContaining({ unshippedQty: null, inTransitQty: null }) }),
    ]));
  } finally {
    await handle.close();
  }
});
