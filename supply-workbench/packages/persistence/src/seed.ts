import { DEFAULT_SETTINGS } from '@sw/domain';
import type { SqlExec } from './client.js';

const AT = '2026-10-12T00:00:00.000Z';
const WAREHOUSE_ID = '0199f0a0-0000-7000-8000-000000000010';

const PEOPLE = [
  ['0199f0a0-0000-7000-8000-000000000001', '管理员', 'admin'],
  ['0199f0a0-0000-7000-8000-000000000002', '采购甲', 'buyer'],
  ['0199f0a0-0000-7000-8000-000000000003', '采购乙', 'buyer'],
  ['0199f0a0-0000-7000-8000-000000000004', '审核人甲', 'reviewer'],
  ['0199f0a0-0000-7000-8000-000000000005', '管理层甲', 'manager'],
  ['0199f0a0-0000-7000-8000-000000000006', '负责人甲', 'lead'],
] as const;

export async function seed(exec: SqlExec): Promise<void> {
  for (const [id, name, role] of PEOPLE) {
    await exec(`INSERT INTO users (id, created_at, updated_at, name, roles, active) VALUES ('${id}', '${AT}', '${AT}', '${name}', ARRAY['${role}'], true) ON CONFLICT (id) DO NOTHING`);
  }
  await exec(`INSERT INTO parties (id, created_at, updated_at, display_name, is_supplier, is_factory, is_own_warehouse) VALUES ('${WAREHOUSE_ID}', '${AT}', '${AT}', '我方仓库', false, false, true) ON CONFLICT (id) DO NOTHING`);
  const range = JSON.stringify(DEFAULT_SETTINGS.dateSanityRange);
  await exec(`INSERT INTO settings (id, upcoming_days, shipped_not_received_alert_days, delivery_note_alert_days, missing_date_hint_window_days, date_sanity_range, own_warehouse_party_id) VALUES ('default', ${DEFAULT_SETTINGS.upcomingDays}, NULL, NULL, ${DEFAULT_SETTINGS.missingDateHintWindowDays}, '${range}'::jsonb, '${WAREHOUSE_ID}') ON CONFLICT (id) DO NOTHING`);
}
