import { expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import { createDb, masterDataQueries, migrate, rememberStoredFile, type AppDatabase } from '../../packages/persistence/src/index.js';
import { codeLinks, itemCodes, storedFiles } from '../../packages/persistence/src/schema/platform.js';

const at = '2026-11-10T00:00:00.000Z';
const lookupPageSize = 200;

it('按 id 取编码和旧的翻页扫描是同一行，缺失文案也不变', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await insertCodes(handle.db, lookupPageSize + 1);
  const master = masterDataQueries(handle.db, { today: () => localDate('2026-11-10') });
  expect(await master.codeById('code-200')).toEqual(await scannedCode(master, 'code-200'));
  await expect(master.codeById('missing')).rejects.toThrow('编码不存在 missing');
  await handle.close();
});

it('旁边有非法枚举时按编号读取仍先失败', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  const row = { createdAt: at, updatedAt: at, itemId: null };
  await handle.db.insert(itemCodes).values([
    { ...row, id: 'good-code', codeType: 'erp_70', codeRaw: 'good-code', codeNorm: 'good-code', status: 'approved' },
    { ...row, id: 'bad-code', codeType: 'nope', codeRaw: 'bad-code', codeNorm: 'bad-code', status: 'approved' },
  ]);
  await handle.db.insert(codeLinks).values([
    { id: 'good-link', createdAt: at, updatedAt: at, fromCodeId: 'good-link-from', toCodeId: 'good-link-to', status: 'approved', evidence: null, reviewedBy: null, reviewedAt: null },
    { id: 'bad-link', createdAt: at, updatedAt: at, fromCodeId: 'bad-link-from', toCodeId: 'bad-link-to', status: 'linked', evidence: null, reviewedBy: null, reviewedAt: null },
  ]);
  const master = masterDataQueries(handle.db, { today: () => localDate('2026-11-10') });
  await expect(master.codeById('good-code')).rejects.toThrow('未知枚举 nope');
  await expect(master.linkById('good-link')).rejects.toThrow('未知枚举 linked');
  await handle.close();
});

it('重复记住同一文件保留第一次写入', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  const first = { sha256: 'abc', originalName: 'a.xlsx', size: 3, mime: 'application/vnd.ms-excel', uploadedBy: 'user-1', at };
  await rememberStoredFile(handle.db, first);
  await rememberStoredFile(handle.db, { ...first, originalName: 'other.xlsx', size: 9, uploadedBy: 'user-2', at: '2026-11-11T00:00:00.000Z' });
  const rows = await handle.db.select().from(storedFiles);
  const stored = rows[0];
  if (stored === undefined) throw new Error('没有文件行');
  expect(rows).toHaveLength(1);
  expect(stored).toMatchObject({
    id: 'abc',
    sha256: 'abc',
    originalName: 'a.xlsx',
    size: 3,
    mime: 'application/vnd.ms-excel',
    storedPath: 'abc',
    uploadedBy: 'user-1',
  });
  await handle.close();
});

async function insertCodes(db: AppDatabase, count: number): Promise<void> {
  await db.insert(itemCodes).values(Array.from({ length: count }, (_, index) => ({
    id: `code-${index}`,
    createdAt: at,
    updatedAt: at,
    codeType: 'erp_70',
    codeRaw: `RAW-${index}`,
    codeNorm: `raw-${index}`,
    itemId: null,
    status: 'pending',
  })));
}

async function scannedCode(master: ReturnType<typeof masterDataQueries>, id: string) {
  let page = 1;
  for (;;) {
    const listed = await master.listCodes({ page, pageSize: lookupPageSize });
    const found = listed.items.find((row) => row.id === id);
    if (found !== undefined) return found;
    if (page * listed.page.pageSize >= listed.page.total) throw new Error(`编码不存在 ${id}`);
    page += 1;
  }
}
