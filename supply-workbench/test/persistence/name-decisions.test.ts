import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDb, type AppHandle } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { itemNameRepository } from '../../packages/persistence/src/repositories/identity.js';

let handle: AppHandle;

beforeAll(async () => {
  handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
});

afterAll(async () => {
  await handle.close();
});

it('一号多名决定能写入并读回', async () => {
  const names = itemNameRepository(handle.db);
  expect(await names.decision('item-1')).toBe('undecided');
  await names.saveDecision('item-1', 'shared_code');
  expect(await names.decision('item-1')).toBe('shared_code');
  await names.saveDecision('item-1', 'same_item');
  expect(await names.decision('item-1')).toBe('same_item');
});
