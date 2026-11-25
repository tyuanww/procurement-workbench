import { entityId } from '@sw/domain';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { devAuth } from '@sw/auth';
import { codeLinkRepository, createDb, factoryReportRepository, importBatchRepository, itemCodeRepository, migrate, partyRepository, seed, userDirectory, type SqlExec } from '@sw/persistence';
import { composeImports } from '../src/composition/imports.js';
import { composeMasterData } from '../src/composition/master-data.js';
import { composeProductArchive, productAttachmentMaxBytes } from '../src/composition/product-archive.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerMasterDataRoutes } from '../src/http/master-data/routes.js';
import { registerProductRoutes } from '../src/http/product-archive/routes.js';
import { loginAs } from './helpers/server.js';
import { aFactoryStockRow, aParty } from '../../../packages/testkit/src/index.js';
import { barcode, buyer, channels, demoArchive, demoBom, demoPo, importCsv, itemCode, supplier } from './helpers/synthetic-imports.js';

const AT = '2026-10-12T00:00:00.000Z';
const archiveFile = { fileName: 'archive.csv', bytes: demoArchive(), template: 'product-archive-v1' } as const;

it('条码精确匹配排在分页之前，相关规格可翻到下一页', async () => {
  const opened = await open();
  try {
    await opened.exec(`insert into products (id, sku_name, barcode_raw, barcode_base, field_sources, created_at, updated_at)
      select 'variant-' || i, '合成相关规格', '780012-' || i, '780012', '{}', now(), now() from generate_series(1, 50) as i`);
    await opened.exec(`insert into products (id, sku_name, barcode_raw, barcode_base, field_sources, created_at, updated_at)
      values ('zz-exact-code', '合成精确条码', '780012', '780012', '{}', now(), now())`);
    const cookie = await loginAs(opened.app, 'reviewer');
    const list = (page: number) => opened.app.inject({ method: 'GET', url: `/api/v1/products?q=780012&page=${page}`, headers: { cookie } });
    const first = (await list(1)).json();
    const next = (await list(2)).json();
    expect(first.page).toEqual({ page: 1, pageSize: 50, total: 51 });
    expect(first.items[0].barcodeRaw).toEqual('780012');
    expect(next.page.page).toEqual(2);
    expect(next.items).toHaveLength(1);
    expect(first.items).not.toContainEqual(next.items[0]);
    expect((await list(0)).statusCode).toEqual(400);
  } finally {
    await opened.close();
  }
});

it('产品采购可切换渠道范围，组成物料显示覆盖和无 BOM 两种状态', async () => {
  const opened = await open();
  try {
    await importCsv(opened.imports, { fileName: 'purchase.csv', bytes: demoPo(), template: 'po-master-v1' });
    await importCsv(opened.imports, archiveFile);
    await importCsv(opened.imports, { fileName: 'bom.csv', bytes: demoBom(), template: 'bom-v1' });
    const cookie = await loginAs(opened.app, 'reviewer');
    for (const code of channels) {
      const id = await productId(opened.exec, code);
      expect((await purchases(opened.app, { cookie, id, scope: 'exact' })).json().rows).toHaveLength(1);
      expect((await purchases(opened.app, { cookie, id, scope: 'all_channels' })).json().rows).toHaveLength(3);
    }
    const id = await productId(opened.exec, barcode);
    expect((await opened.app.inject({ method: 'GET', url: `/api/v1/products/${id}/materials`, headers: { cookie } })).json()).toMatchObject({ coverage: { linked: 0, total: 1 } });
    const noBom = await productId(opened.exec, '6900000000002');
    expect((await opened.app.inject({ method: 'GET', url: `/api/v1/products/${noBom}/materials`, headers: { cookie } })).json()).toMatchObject({ kind: 'no_bom' });

    const renamed = await opened.app.inject({ method: 'PATCH', url: `/api/v1/products/${noBom}`, headers: { cookie }, payload: { skuName: '工作台保留名' } });
    expect(renamed.statusCode).toBe(200);
    await importCsv(opened.imports, archiveFile);
    expect(await textColumn(opened.exec, `select sku_name as value from products where id = '${noBom}'`)).toBe('工作台保留名');
    expect(await countIssues(opened.exec, 'PRODUCT_FIELD_KEPT')).toBeGreaterThan(0);
  } finally {
    await opened.close();
  }
});

it('审批条码与品号的对照后，产品显示代工厂库存', async () => {
  const opened = await open();
  try {
    await importCsv(opened.imports, archiveFile);
    await putPendingStock(opened.handle.db);
    const cookie = await loginAs(opened.app, 'reviewer');
    const id = await productId(opened.exec, barcode);
    const url = `/api/v1/products/${id}/stock`;
    expect((await opened.app.inject({ method: 'GET', url, headers: { cookie } })).json().factory.rows).toEqual([]);
    const approved = await opened.app.inject({ method: 'POST', url: '/api/v1/master/code-links/demo-link/approve', headers: { cookie }, payload: {} });
    expect(approved.statusCode).toBe(200);
    expect((await opened.app.inject({ method: 'GET', url, headers: { cookie } })).json().factory.rows).toHaveLength(1);
  } finally {
    await opened.close();
  }
});

async function putPendingStock(db: Awaited<ReturnType<typeof createDb>>['db']) {
  const factory = aParty({ id: entityId('demo-factory'), displayName: supplier });
  const batchId = entityId('demo-stock-batch');
  const fromCodeId = entityId('demo-barcode');
  const toCodeId = entityId('demo-item-code');
  await partyRepository(db).save(factory);
  await importBatchRepository(db).save({
    id: batchId, createdAt: AT, updatedAt: AT, fileId: entityId('demo-stock-file'),
    template: 'factory-progress-v1', factoryPartyId: factory.id, status: 'committed',
    fileMeta: {}, stats: {}, decisions: {}, createdBy: buyer.id, committedBy: buyer.id,
    committedAt: AT, rolledBackBy: null, rolledBackAt: null, error: null,
  });
  await factoryReportRepository(db).save(aFactoryStockRow({
    importBatchId: batchId, factoryPartyId: factory.id,
    raw: { itemCodeRaw: { value: itemCode }, qtyOnHand: { value: 25 } },
  }));
  const codes = itemCodeRepository(db);
  await codes.save({ id: fromCodeId, createdAt: AT, updatedAt: AT, codeRaw: barcode, codeNorm: barcode, codeType: 'barcode_69', itemId: null, status: 'approved' });
  await codes.save({ id: toCodeId, createdAt: AT, updatedAt: AT, codeRaw: itemCode, codeNorm: itemCode, codeType: 'erp_70', itemId: null, status: 'approved' });
  await codeLinkRepository(db).save({
    id: entityId('demo-link'), createdAt: AT, updatedAt: AT, fromCodeId, toCodeId,
    status: 'pending', evidence: null, reviewedBy: null, reviewedAt: null,
  });
}

async function open() {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-product-'));
  const imports = composeImports({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai' });
  const products = composeProductArchive({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai' });
  const master = composeMasterData({ db: handle.db, timeZone: 'Asia/Shanghai' });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => { registerProductRoutes({ app: server, api: products, attachmentMaxBytes: productAttachmentMaxBytes() }); registerMasterDataRoutes(server, master); },
  });
  return { handle, exec: handle.exec, app, imports, close: async () => { await app.close(); await handle.close(); await rm(uploadDir, { recursive: true }); } };
}

async function purchases(app: Awaited<ReturnType<typeof open>>['app'], input: { readonly cookie: string; readonly id: string; readonly scope: string }) {
  return app.inject({ method: 'GET', url: `/api/v1/products/${input.id}/purchases?scope=${input.scope}`, headers: { cookie: input.cookie } });
}

async function productId(exec: SqlExec, barcode: string): Promise<string> {
  const result = await exec(`select id from products where barcode_raw = '${barcode}'`);
  const row = rows(result)[0];
  if (typeof row !== 'object' || row === null || !('id' in row) || typeof row.id !== 'string') throw new Error(`没有产品 ${barcode}`);
  return row.id;
}

async function textColumn(exec: SqlExec, statement: string): Promise<string> {
  const row = rows(await exec(statement))[0];
  if (typeof row !== 'object' || row === null || !('value' in row) || typeof row.value !== 'string') throw new Error('没有文本');
  return row.value;
}

function rows(result: unknown): unknown[] {
  if (Array.isArray(result)) return rows(result[0]);
  if (typeof result === 'object' && result !== null && 'rows' in result && Array.isArray(result.rows)) return result.rows;
  return [];
}

async function countIssues(exec: SqlExec, code: string): Promise<number> {
  const row = rows(await exec(`select count(*)::int as total from import_rows where issues::text like '%${code}%'`))[0];
  if (typeof row !== 'object' || row === null || !('total' in row)) return 0;
  return typeof row.total === 'number' ? row.total : Number(row.total);
}
