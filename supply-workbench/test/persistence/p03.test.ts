import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { entityId, localDate, productId } from '../../packages/domain/src/index.js';
import { createDb, type AppHandle } from '../../packages/persistence/src/client.js';
import { migrate } from '../../packages/persistence/src/migrate.js';
import { productContactRepository, productImageRepository, productRepository, replaceBomLines } from '../../packages/persistence/src/repositories/products.js';
import { bomLines } from '../../packages/persistence/src/schema/archive.js';
import { weeklyReportRepository } from '../../packages/persistence/src/repositories/weekly-reports.js';
import { describeProductRepositoryContract, describeWeeklyReportRepositoryContract } from '../../packages/testkit/src/index.js';

let handle: AppHandle;

beforeAll(async () => {
  handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
});

afterAll(async () => {
  await handle.close();
});

beforeEach(async () => {
  await handle.exec('truncate table products, product_images, product_contacts, bom_lines, weekly_reports restart identity cascade');
});

describeProductRepositoryContract(() => productRepository(handle.db));
describeWeeklyReportRepositoryContract(() => weeklyReportRepository(handle.db));

it('已保存的周报不能再改 data', async () => {
  const repo = weeklyReportRepository(handle.db);
  const report = {
    id: entityId('week-1'),
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    weekStart: localDate('2026-10-05'),
    generatedAt: '2026-10-12T00:00:00.000Z',
    generatedBy: entityId('user-1'),
    data: { kept: true },
    dataWatermark: {},
    exports: {},
    supersededBy: null,
  };
  await repo.save(report);
  await expect(repo.save({ ...report, data: { kept: false } })).rejects.toThrow(/冻结/);
});

it('图片、联系人和 BOM 行可以写回', async () => {
  const images = productImageRepository(handle.db);
  await images.save({ id: entityId('img-1'), productId: productId('p1'), slot: 'inner', fileId: entityId('file-1'), order: 1, source: 'import', importBatchId: null, uploadedBy: null, hiddenAt: null, hiddenBy: null, hiddenReason: null });
  expect((await images.listByProduct('p1')).map((row) => row.id)).toEqual(['img-1']);
  const contacts = productContactRepository(handle.db);
  await contacts.replaceRole({ productId: 'p1', role: 'product_info', people: [{ productId: productId('p1'), role: 'product_info', userId: null, nameRaw: '样例采购员', note: null, source: 'import', updatedBy: entityId('user-1'), updatedAt: '2026-10-12T00:00:00.000Z' }] });
  expect((await contacts.listByProduct('p1')).map((row) => row.nameRaw)).toEqual(['样例采购员']);
  await replaceBomLines({ db: handle.db, productBarcodeRaw: '2000000003023', lines: [{ productBarcodeRaw: '2000000003023', productName: '面膜', reorderCount: null, cumulativeQty: null, partCodeRaw: '15112610221', partName: '膜布', importBatchId: 'b1', rowNo: 2, mergedFill: false }] });
  await replaceBomLines({ db: handle.db, productBarcodeRaw: '2000000003023', lines: [] });
  expect(await handle.db.select().from(bomLines)).toEqual([]);
});
