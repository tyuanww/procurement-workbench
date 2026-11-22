import { expect, it } from 'vitest';
import { orderLineId } from '../../packages/domain/src/index.js';
import { createDb } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { orderLineRepository } from '../../packages/persistence/src/repositories/order-lines.js';
import { anOrderLine } from '../../packages/testkit/src/index.js';

const MIGRATION = '0016_order_line_candidate_key';
const KEY = 'PO-1|697|海葡萄#1';

it('已有重复候选键时迁移失败，并留下这两行', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    await handle.exec(`delete from schema_migrations where id = '${MIGRATION}'`);
    await handle.exec('drop index if exists order_lines_candidate_key_uq');
    await insertLine(handle.exec, 'line-a');
    await insertLine(handle.exec, 'line-b');
    await expect(migrate(handle.exec)).rejects.toThrow(/采购总表订单行候选键重复[\s\S]*PO-1\|697\|海葡萄#1[\s\S]*line-a[\s\S]*line-b/);
    const ids = await keys(handle.exec);
    expect(ids).toEqual(['line-a', 'line-b']);
    expect(await hasIndex(handle.exec)).toBe(false);
  } finally {
    await handle.close();
  }
});

it('唯一约束挡住第二个候选键，并报状态冲突', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    const repo = orderLineRepository(handle.db);
    await repo.save(anOrderLine({ id: orderLineId('line-a'), candidateKey: KEY }));
    await repo.save(anOrderLine({ id: orderLineId('line-a'), candidateKey: KEY, qtyOrdered: 20 }));
    await expect(repo.save(anOrderLine({ id: orderLineId('line-b'), candidateKey: KEY }))).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    const other = anOrderLine({ id: orderLineId('line-c'), candidateKey: null });
    await repo.save(other);
    const saveConditional = repo.saveConditional;
    if (saveConditional === undefined) throw new Error('订单行仓储没有条件更新');
    await expect(saveConditional({ ...other, candidateKey: KEY }, other.updatedAt)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
    expect((await repo.find('line-c'))?.candidateKey).toBeNull();
    expect(await repo.find('line-a')).toMatchObject({ qtyOrdered: 20 });
    expect(await repo.find('line-b')).toBeUndefined();
  } finally {
    await handle.close();
  }
});

async function insertLine(exec: (statement: string) => Promise<unknown>, id: string): Promise<void> {
  await exec(`insert into order_lines (id, created_at, updated_at, purchase_order_id, lane, origin, missing_in_latest_import, stage, stage_changed_at, candidate_key) values ('${id}', now(), now(), 'po-1', 'finished', 'import_po_master', false, 'no_batch', now(), '${KEY}')`);
}

async function keys(exec: (statement: string) => Promise<unknown>): Promise<string[]> {
  const result = await exec(`select id from order_lines where candidate_key = '${KEY}' order by id`);
  return rows(result).map((row) => row.id).filter((id): id is string => typeof id === 'string');
}

async function hasIndex(exec: (statement: string) => Promise<unknown>): Promise<boolean> {
  const result = await exec(`select indexname from pg_indexes where indexname = 'order_lines_candidate_key_uq'`);
  return rows(result).length > 0;
}

function rows(result: unknown): Array<Record<string, unknown>> {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (typeof candidate !== 'object' || candidate === null || !('rows' in candidate) || !Array.isArray(candidate.rows)) return [];
  return candidate.rows.filter(isRow);
}

function isRow(row: unknown): row is Record<string, unknown> {
  return typeof row === 'object' && row !== null;
}
