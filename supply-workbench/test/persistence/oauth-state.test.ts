import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDb, migrate, oauthStateRepository, type AppHandle } from '../../packages/persistence/src/index.js';

let handle: AppHandle;

beforeAll(async () => {
  handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
});

afterAll(async () => {
  await handle.close();
});

it('OAuth state 在 PGlite 中只能消费一次并拒绝过期值', async () => {
  const repo = oauthStateRepository(handle.db);
  await repo.issue({ stateHash: 'hash-1', nonceHash: 'nonce-1', redirectUri: 'https://supply.example.com/callback', returnTo: '/dashboard', createdAt: '2026-11-08T00:00:00.000Z', expiresAt: '2026-11-08T00:05:00.000Z' });
  expect(await repo.consume({ stateHash: 'hash-1', nonceHash: 'nonce-1', at: '2026-11-08T00:01:00.000Z' })).toEqual({ redirectUri: 'https://supply.example.com/callback', returnTo: '/dashboard' });
  expect(await repo.consume({ stateHash: 'hash-1', nonceHash: 'nonce-1', at: '2026-11-08T00:02:00.000Z' })).toBeUndefined();
  await repo.issue({ stateHash: 'hash-2', nonceHash: 'nonce-2', redirectUri: 'https://supply.example.com/callback', returnTo: '/', createdAt: '2026-11-08T00:00:00.000Z', expiresAt: '2026-11-08T00:05:00.000Z' });
  expect(await repo.consume({ stateHash: 'hash-2', nonceHash: 'nonce-2', at: '2026-11-08T00:05:00.000Z' })).toBeUndefined();
});
