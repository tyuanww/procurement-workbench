import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createDb, type AppHandle } from '../../packages/persistence/src/client.js';
import { fileStore } from '../../packages/persistence/src/files/local-disk.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { numberOrNull } from '../../packages/persistence/src/mappers/number.js';
import { exceptionRepository, followUpRepository } from '../../packages/persistence/src/repositories/notes.js';
import { settingsRepository } from '../../packages/persistence/src/repositories/settings.js';
import { deliveryBatchRepository } from '../../packages/persistence/src/repositories/delivery-batches.js';
import { orderLineRepository } from '../../packages/persistence/src/repositories/order-lines.js';
import { userRepository } from '../../packages/persistence/src/repositories/users.js';
import {
  describeDeliveryBatchRepositoryContract,
  describeExceptionRepositoryContract,
  describeFileStoreContract,
  describeFollowUpRepositoryContract,
  describeOrderLineRepositoryContract,
  describeSettingsRepositoryContract,
  describeUserRepositoryContract,
} from '../../packages/testkit/src/index.js';

let handle: AppHandle;
let dir: string;

beforeAll(async () => {
  handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  dir = await mkdtemp(path.join(tmpdir(), 'sw-files-'));
});

afterAll(async () => {
  await handle.close();
  await rm(dir, { recursive: true, force: true });
});

beforeEach(async () => {
  await handle.exec(`truncate table users, parties, settings, exceptions, follow_ups, order_lines, delivery_batches, shipments, receipts, delivery_notes, batch_date_changes restart identity cascade`);
});

describeUserRepositoryContract(() => userRepository(handle.db));
describeSettingsRepositoryContract(() => settingsRepository(handle.db));
describeExceptionRepositoryContract(() => exceptionRepository(handle.db));
describeFollowUpRepositoryContract(() => followUpRepository(handle.db));
describeOrderLineRepositoryContract(() => orderLineRepository(handle.db));
describeDeliveryBatchRepositoryContract(() => deliveryBatchRepository(handle.db));
describeFileStoreContract(() => fileStore(dir));

it('文件存储拒绝路径穿越 id', async () => {
  const store = fileStore(dir);
  expect(await store.read('../../etc/passwd')).toBeUndefined();
  expect(await store.read('..%2F..%2Fetc%2Fpasswd')).toBeUndefined();
});

it('numeric 映射把字符串变成数字，null 仍是 null', () => {
  expect(numberOrNull('12.5000')).toBe(12.5);
  expect(numberOrNull(null)).toBeNull();
});
