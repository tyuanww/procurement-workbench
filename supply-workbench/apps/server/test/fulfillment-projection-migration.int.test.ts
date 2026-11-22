import { expect, it } from 'vitest';
import { deriveBatchStatus, projectLine } from '@sw/domain';
import { currentMigration, databaseHealth, deliveryBatchRepository, followUpRepository, migrate, orderLineRepository } from '@sw/persistence';
import type { AppHandle } from '@sw/persistence';
import { MIGRATIONS } from '../../../packages/persistence/src/migrate.js';
import { arrivalTestDatabase } from './helpers/arrival-database.js';

const migration = '0023_fulfillment_placeholder_projection';
const stamp = '2026-10-01T01:00:00.000Z';
const warehouse = 'projection-wh';

it('升级按有效发收重算历史批次及订单行，保留原凭据、合法旧账和终态', async () => {
  const handle = await arrivalTestDatabase();
  try {
    await migrate(handle, MIGRATIONS.filter(({ id }) => id < migration));
    await seedHistoricalProjection(handle);
    const lines = orderLineRepository(handle.db);
    const batches = deliveryBatchRepository(handle.db);
    expect((await lines.get('projection-done')).stage).toBe('done');
    expect((await batches.get('projection-no-proof')).status).toBe('received');

    await migrate(handle, MIGRATIONS.filter(({ id }) => id <= migration));
    await verifyProjections(handle);
    const good = await batches.getWithRecords('projection-legacy');
    expect(good.batch).toMatchObject({ status: 'received', statusChangedAt: stamp, updatedAt: stamp });
    expect(good.receipts.find(({ id }) => id === 'projection-legitimate-old')?.fulfillment).toBeNull();
    const repaired = await batches.getWithRecords('projection-no-proof');
    expect(repaired.receipts[0]?.fulfillment).toEqual({ kind: 'received', unit: ' ／\u3000', evidence: '原签收 R1', reviewReason: null, disposition: 'normal' });
    expect(repaired.batch.statusChangedAt).not.toBe(stamp);
    expect((await batches.get('projection-closed')).statusChangedAt).toBe(stamp);
    expect((await batches.get('projection-cancelled-batch')).statusChangedAt).toBe(stamp);
    expect(await currentMigration(handle.exec)).toBe(migration);
    await verifyFollowUpUpgrade(handle);
  } finally {
    await handle.close();
  }
});

async function verifyFollowUpUpgrade(handle: AppHandle): Promise<void> {
  await handle.exec(`
    INSERT INTO follow_ups (id, created_at, updated_at, order_line_id, batch_id, kind, text, created_by)
    VALUES ('projection-note', '${stamp}', '${stamp}', 'projection-no-date', 'projection-no-date', 'note', '原跟进记录', 'projection-buyer')
  `);
  await migrate(handle);
  expect(await databaseHealth(handle.exec)).toEqual({ ok: true, db: 'up', migration: '0024_follow_up_reminder' });
  const kept = await followUpRepository(handle.db).get('projection-note');
  expect(kept).toMatchObject({ batchId: 'projection-no-date', text: '原跟进记录' });
  expect(kept.nextFollowUpAt).toBeUndefined();
}

async function verifyProjections(handle: AppHandle) {
  const lines = orderLineRepository(handle.db);
  const batches = deliveryBatchRepository(handle.db);
  const expected = [
    { lineId: 'projection-done', stage: 'awaiting_shipment', nextDueBatchId: 'projection-no-proof', nextDueDate: '2026-11-21' },
    { lineId: 'projection-no-date', stage: 'awaiting_date', nextDueBatchId: 'projection-no-date', nextDueDate: null },
    { lineId: 'projection-mixed', stage: 'partially_received', nextDueBatchId: 'projection-mixed', nextDueDate: '2026-11-23' },
    { lineId: 'projection-legacy', stage: 'done', nextDueBatchId: null, nextDueDate: null },
    { lineId: 'projection-terminal', stage: 'done', nextDueBatchId: null, nextDueDate: null },
    { lineId: 'projection-cancelled-line', stage: 'cancelled', nextDueBatchId: null, nextDueDate: null },
    { lineId: 'projection-multiple', stage: 'awaiting_receipt', nextDueBatchId: 'projection-aa', nextDueDate: '2026-11-21' },
  ];
  for (const { lineId, ...projection } of expected) {
    const line = await lines.get(lineId);
    const lineBatches = await batches.listByOrderLine(lineId);
    expect(line, lineId).toMatchObject(projection);
    expect(line, lineId).toMatchObject(projectLine(line, lineBatches));
    for (const batch of lineBatches) {
      const facts = await batches.getWithRecords(batch.id);
      expect(batch.status, batch.id).toBe(deriveBatchStatus({ ...batch, ...facts }));
    }
  }
}

async function seedHistoricalProjection({ exec }: AppHandle) {
  await exec(`
    INSERT INTO order_lines (id, created_at, updated_at, purchase_order_id, lane, origin, missing_in_latest_import, stage, stage_changed_at, cancelled_at)
    SELECT id, '${stamp}', '${stamp}', ' projection-po', 'finished', 'manual', false, stage, '${stamp}',
      CASE WHEN stage = 'cancelled' THEN '${stamp}'::timestamptz END
    FROM (VALUES
      ('projection-done', 'done'), ('projection-no-date', 'awaiting_receipt'), ('projection-mixed', 'done'),
      ('projection-legacy', 'done'), ('projection-terminal', 'done'), ('projection-cancelled-line', 'cancelled'),
      ('projection-multiple', 'awaiting_shipment')
    ) AS sample(id, stage);

    INSERT INTO delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, planned_unit, receiver_party_id, date_buyer_confirmed, status, status_changed_at, origin, closed_at, cancelled_at)
    SELECT id, '${stamp}', '${stamp}', line_id, seq, plan, '件', '${warehouse}', due::date, status, '${stamp}', 'manual',
      CASE WHEN status = 'closed' THEN '${stamp}'::timestamptz END,
      CASE WHEN status = 'cancelled' THEN '${stamp}'::timestamptz END
    FROM (VALUES
      ('projection-no-proof', 'projection-done', 1, 60, '2026-11-21', 'received'),
      ('projection-no-date', 'projection-no-date', 1, 10, NULL, 'shipped'),
      ('projection-mixed', 'projection-mixed', 1, 0.8, '2026-11-23', 'received'),
      ('projection-legacy', 'projection-legacy', 1, 5, '2026-11-21', 'received'),
      ('projection-closed', 'projection-terminal', 1, 10, '2026-11-21', 'closed'),
      ('projection-cancelled-batch', 'projection-terminal', 2, 10, '2026-11-20', 'cancelled'),
      ('projection-cancelled-line-batch', 'projection-cancelled-line', 1, 10, '2026-11-21', 'received'),
      ('projection-nodue', 'projection-multiple', 1, 10, NULL, 'awaiting_date'),
      ('projection-later', 'projection-multiple', 2, 10, '2026-11-22', 'confirmed'),
      ('projection-aa', 'projection-multiple', 3, 10, '2026-11-21', 'received'),
      ('projection-zz', 'projection-multiple', 3, 10, '2026-11-21', 'confirmed'),
      ('projection-ab', 'projection-multiple', 4, 10, '2026-11-21', 'confirmed')
    ) AS sample(id, line_id, seq, plan, due, status);

    UPDATE order_lines SET next_due_batch_id = 'projection-zz', next_due_date = '2026-11-21' WHERE id = 'projection-multiple';
    UPDATE order_lines SET next_due_batch_id = id WHERE id = 'projection-no-date';

    INSERT INTO shipments (id, created_at, updated_at, batch_id, qty, shipped_on, source, created_by, fulfillment)
    SELECT id, '${stamp}', '${stamp}', batch_id, 10, '2026-10-01', 'manual', 'projection-buyer',
      jsonb_build_object('kind', 'verified', 'unit', '件', 'evidence', evidence, 'reviewReason', NULL)
    FROM (VALUES ('projection-shipment-invalid', 'projection-no-date', '—'),
      ('projection-shipment-valid', 'projection-aa', '发货回单 S1'),
      ('projection-shipment-mixed', 'projection-mixed', '发货回单 S2')
    ) AS sample(id, batch_id, evidence);

    INSERT INTO receipts (id, created_at, updated_at, batch_id, qty, received_on, category, source, created_by, fulfillment)
    SELECT id, '${stamp}', '${stamp}', batch_id, qty, '2026-10-01', 'finished', 'workbench', 'projection-buyer',
      CASE WHEN evidence IS NOT NULL THEN jsonb_build_object('kind', 'received', 'unit', unit,
        'evidence', evidence, 'reviewReason', NULL, 'disposition', 'normal') END
    FROM (VALUES
      ('projection-receipt-invalid', 'projection-no-proof', 60, ' ／\u3000', '原签收 R1'),
      ('projection-receipt-missing', 'projection-mixed', 0.2, '件', '-'),
      ('projection-receipt-valid', 'projection-mixed', 0.7, '件', '原签收 R2'),
      ('projection-legitimate-old', 'projection-legacy', 5, NULL, NULL),
      ('projection-legacy-extra', 'projection-legacy', 1, '／', '原签收 R3'),
      ('projection-closed-receipt', 'projection-closed', 10, '件', '—'),
      ('projection-cancelled-receipt', 'projection-cancelled-batch', 10, '件', '—'),
      ('projection-line-cancelled-receipt', 'projection-cancelled-line-batch', 10, '件', '—'),
      ('projection-multi-receipt', 'projection-aa', 10, '件', '－')
    ) AS sample(id, batch_id, qty, unit, evidence);
  `);
}
