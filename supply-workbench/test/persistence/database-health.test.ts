import { expect, it } from 'vitest';
import { databaseHealth, type SqlExec } from '../../packages/persistence/src/index.js';
import { LATEST_MIGRATION, MIGRATION_IDS } from '../../packages/persistence/src/migrate.js';

it('完整迁移集合时数据库健康', async () => {
  await expect(databaseHealth(rows(MIGRATION_IDS.map((id) => ({ id }))))).resolves.toEqual({ ok: true, db: 'up', migration: LATEST_MIGRATION });
});

it('缺任意一个预期迁移都不算健康', async () => {
  for (const missing of MIGRATION_IDS) {
    const applied = MIGRATION_IDS.filter((id) => id !== missing).map((id) => ({ id }));
    const health = await databaseHealth(rows(applied));
    expect(health.ok, missing).toBe(false);
    expect(health.db, missing).toBe('up');
  }
});

it('只有最大编号的迁移记录不算健康', async () => {
  await expect(databaseHealth(rows([{ id: LATEST_MIGRATION }]))).resolves.toEqual({ ok: false, db: 'up', migration: LATEST_MIGRATION });
});

it('出现未知迁移 id 时数据库不健康', async () => {
  const applied = [...MIGRATION_IDS.map((id) => ({ id })), { id: '9999_unknown' }];
  await expect(databaseHealth(rows(applied))).resolves.toEqual({ ok: false, db: 'up', migration: LATEST_MIGRATION });
});

it('落后的迁移不算健康', async () => {
  await expect(databaseHealth(rows([{ id: '0001_name_decisions' }]))).resolves.toEqual({ ok: false, db: 'up', migration: '0001_name_decisions' });
});

it('没有迁移记录时数据库不算健康', async () => {
  await expect(databaseHealth(rows([]))).resolves.toEqual({ ok: false, db: 'down', migration: 'none' });
});

it('查询失败时数据库不可用', async () => {
  const exec: SqlExec = async () => {
    throw new Error('连接失败');
  };
  await expect(databaseHealth(exec)).resolves.toEqual({ ok: false, db: 'down', migration: 'unknown' });
});

function rows(records: readonly Record<string, unknown>[]): SqlExec {
  return async () => ({ rows: records });
}
