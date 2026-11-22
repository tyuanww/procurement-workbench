import { afterAll, beforeAll, expect, it } from 'vitest';
import { settingsRepository } from '../../packages/persistence/src/repositories/settings.js';
import { createDb, migrate, type AppHandle } from '../../packages/persistence/src/index.js';

let handle: AppHandle;

beforeAll(async () => {
  handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
});

afterAll(async () => {
  await handle.close();
});

it('设置仓储按完整旧值条件更新，过期写入不覆盖新值', async () => {
  const repo = settingsRepository(handle.db);
  if (repo.saveConditional === undefined) throw new Error('设置仓储未提供条件写入');
  const before = await repo.get();
  const first = { ...before, upcomingDays: before.upcomingDays + 1 };
  expect(await repo.saveConditional(first, before)).toBe(true);

  const stale = { ...before, upcomingDays: before.upcomingDays + 2 };
  expect(await repo.saveConditional(stale, before)).toBe(false);
  expect((await repo.get()).upcomingDays).toBe(first.upcomingDays);
});
