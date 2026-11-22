import { expect, it } from 'vitest';
import { migrate } from '@sw/persistence';
import { arrivalTestDatabase } from './helpers/arrival-database.js';

it('升级保留原始登记、当前点收引用和重放历史，仅释放已撤销或替换点收引用', async () => {
  const handle = await arrivalTestDatabase();
  const session = await handle.session();
  try {
    await migrate(session.exec);
    await session.exec('BEGIN');
    await session.exec(`\
      DELETE FROM schema_migrations WHERE id = '0022_arrival_active_references';
      INSERT INTO arrivals (id, registered_at, registered_by, source, warehouse_id, received_on, item_code, qty, unit, revision, allocation)
      VALUES
        ('migration-claim-a', now(), 'migration-buyer', '{"kind":"document","source":"点收\u3000 系统","number":"Ａ","row":"1"}', 'migration-wh', '2026-11-19', 'A', 1, '件', 3, NULL),
        ('migration-claim-b', now(), 'migration-buyer', '{"kind":"ledger","source":"台账","number":"B","row":"1"}', 'migration-wh', '2026-11-19', 'B', 1, '件', 2, '{}');
      INSERT INTO arrival_references (arrival_id, key)
      VALUES
        ('migration-claim-a', '["document","点收 系统","A","1"]'),
        ('migration-claim-a', '["document","点收 系统","A","2"]'),
        ('migration-claim-b', '["ledger","台账","B","1"]'),
        ('migration-claim-b', '["document","点收 系统","B","1"]'),
        ('migration-claim-b', '["document","点收 系统","B","2"]');
      INSERT INTO arrival_revisions (arrival_id, revision, request_key)
      SELECT arrival_id, revision, jsonb_build_array(kind, NULL, key)::text
      FROM (VALUES
        ('migration-claim-a', 1, 'allocate', '["document","点收 系统","A","1"]'),
        ('migration-claim-a', 2, 'allocate', '["document","点收 系统","A","2"]'),
        ('migration-claim-a', 3, 'rollback', NULL),
        ('migration-claim-b', 1, 'allocate', '["document","点收 系统","B","1"]'),
        ('migration-claim-b', 2, 'allocate', '["document","点收 系统","B","2"]')
      ) AS fixture(arrival_id, revision, kind, key);
      INSERT INTO audit_log (id, actor_user_id, action, entity, entity_id, at)
      VALUES ('migration-claim-a-audit', 'migration-buyer', 'arrival.rollback', '到仓凭据', 'migration-claim-a', now());
    `);
    await migrate(session.exec);
    const verification = await session.exec(`
      SELECT
        (SELECT array_agg(key ORDER BY key) FROM arrival_references WHERE arrival_id LIKE 'migration-claim-%') AS claims,
        (SELECT count(*)::integer FROM arrival_revisions WHERE arrival_id LIKE 'migration-claim-%') AS revisions,
        (SELECT action FROM audit_log WHERE id = 'migration-claim-a-audit') AS audit_action
    `);
    const result = Array.isArray(verification) ? verification[0] : verification;
    expect(result).toMatchObject({ rows: [{
      claims: ['["document","点收 系统","A","1"]', '["document","点收 系统","B","2"]', '["ledger","台账","B","1"]'],
      revisions: 5,
      audit_action: 'arrival.rollback',
    }] });
  } finally {
    await session.exec('ROLLBACK');
    session.release();
    await handle.close();
  }
});
