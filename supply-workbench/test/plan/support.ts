import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { entityId } from '../../packages/domain/src/values/ids.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import type { SqlExec } from '../../packages/persistence/src/client.js';
import type { AppHandle } from '../../packages/persistence/src/client.js';
import { createDb } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { planQueries } from '../../packages/persistence/src/queries/plan/index.js';
import { planUnitOfWork } from '../../packages/persistence/src/repositories/plan/index.js';
import {
  makeAddWorkItemDependency,
  makeChangeWorkItemStatus,
  makeCreateWorkItem,
  makeGenerateWorkItems,
  makeGetDailyPlan,
  makeGetSchedule,
  makeGetWorkItem,
  makeListWorkItems,
  makeUpdateWorkItem,
} from '../../packages/application/src/plan/index.js';
import { FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';

export const AT = '2026-11-09T00:00:00.000Z';
export const TODAY = localDate('2026-11-09');
export const TOMORROW = localDate('2026-11-10');
export const YESTERDAY = localDate('2026-11-08');

const MIGRATION_PATH = fileURLToPath(new URL('../../packages/persistence/src/migrations/0015_work_items.sql', import.meta.url));

export const BUYER = { id: entityId('buyer-1'), name: '采购甲', roles: ['buyer'] as const };

export type PlanWiring = ReturnType<typeof wiring>;

export async function openPlanDb(): Promise<AppHandle> {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await applyWorkItemsMigration(handle.exec);
  return handle;
}

export async function resetPlanDb(handle: AppHandle): Promise<void> {
  await handle.exec('truncate table work_items, work_item_events, work_item_dependencies, delivery_batches, order_lines, purchase_orders, users, parties, audit_log restart identity cascade');
}

export async function seedPlanBase(handle: AppHandle): Promise<void> {
  await handle.exec(`insert into users (id, created_at, updated_at, name, roles, active) values
    ('buyer-1', '${AT}', '${AT}', '采购甲', array['buyer'], true),
    ('buyer-2', '${AT}', '${AT}', '采购乙', array['buyer'], true)`);
  await handle.exec(`insert into parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse, note) values
    ('party-supplier', '${AT}', '${AT}', '甲代工厂', true, true, false, null),
    ('party-other', '${AT}', '${AT}', '示例工厂', false, true, false, null)`);
  await handle.exec(`insert into purchase_orders (id, created_at, updated_at, po_raw, po_norm, po_format, related_po_raws, supplier_party_id, supplier_raw, lane, oa_demand_ref) values
    ('po-1', '${AT}', '${AT}', 'PO-1', 'PO-1', 'OTHER', array[]::text[], 'party-supplier', '甲代工厂', 'finished', null)`);
  await handle.exec(`insert into order_lines (id, created_at, updated_at, purchase_order_id, lane, item_id, item_code_raw, barcode_raw, name_raw, qty_ordered, unit, buyer_user_id, receiver_party_id, origin, current_snapshot_id, candidate_key, missing_in_latest_import, cancelled_at, cancel_reason, stage, stage_changed_at, next_due_batch_id, next_due_date) values
    ('line-1', '${AT}', '${AT}', 'po-1', 'finished', null, null, null, '海葡萄', null, null, 'buyer-1', null, 'manual', null, null, false, null, null, 'no_batch', '${AT}', null, null)`);
  await handle.exec(`insert into delivery_batches (id, created_at, updated_at, order_line_id, seq, planned_qty, receiver_party_id, date_factory_required, date_supplier_promised, date_buyer_confirmed, status, status_changed_at, origin) values
    ('batch-1', '${AT}', '${AT}', 'line-1', 1, 10, 'party-other', '2026-11-10', '2026-11-11', '2026-11-12', 'confirmed', '${AT}', 'manual'),
    ('batch-2', '${AT}', '${AT}', 'line-1', 2, 5, 'party-other', null, null, '2026-11-09', 'confirmed', '${AT}', 'manual'),
    ('batch-3', '${AT}', '${AT}', 'line-1', 3, 3, 'party-other', '2026-11-20', null, null, 'confirmed', '${AT}', 'manual')`);
}

export function wiring(handle: AppHandle) {
  const clock = new FixedClock(AT);
  const write = { uow: planUnitOfWork(handle.db), clock, ids: new SequentialIds() };
  const reads = { plan: planQueries(handle.db), clock };
  return {
    clock,
    create: makeCreateWorkItem(write),
    update: makeUpdateWorkItem(write),
    changeStatus: makeChangeWorkItemStatus(write),
    addDependency: makeAddWorkItemDependency(write),
    generate: makeGenerateWorkItems(write),
    daily: makeGetDailyPlan(reads),
    schedule: makeGetSchedule(reads),
    list: makeListWorkItems(reads),
    get: makeGetWorkItem(reads),
  };
}

async function applyWorkItemsMigration(exec: SqlExec): Promise<void> {
  const text = readFileSync(MIGRATION_PATH, 'utf8');
  for (const statement of text.split('--> statement-breakpoint')) {
    const trimmed = statement.trim();
    if (trimmed !== '') await exec(trimmed);
  }
}
