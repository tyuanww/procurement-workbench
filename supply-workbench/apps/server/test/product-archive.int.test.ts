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
import { BOM_COLUMNS } from '../../../packages/importers/src/templates/bom-v1/columns.js';
import { csvBytes } from '../../../test/importers/fixtures/workbooks.js';
import { barcode, buyer, channels, demoArchive, demoBom, demoPo, importCsv, itemCode, supplier } from './helpers/synthetic-imports.js';

const AT = '2026-10-12T00:00:00.000Z';
const archiveFile = { fileName: 'archive.csv', bytes: demoArchive(), template: 'product-archive-v1' } as const;

it('推荐人可解析通讯录姓名，已有联系人继续返回原始录入名', async () => {
  const opened = await open();
  try {
    await importCsv(opened.imports, archiveFile);
    const id = await productId(opened.exec, barcode);
    const cookie = await loginAs(opened.app, 'admin');
    const base = `/api/v1/products/${id}`;
    const updated = await opened.app.inject({
      method: 'PUT', url: `${base}/contacts`, headers: { cookie },
      payload: { role: 'product_info', people: [{ userId: buyer.id, nameRaw: '合成业务原名', note: '保留联系人备注' }] },
    });
    expect(updated.statusCode).toBe(200);
    const people = [{ role: 'product_info', people: [expect.objectContaining({ userId: buyer.id, name: '合成业务原名', note: '保留联系人备注' })] }];
    expect(updated.json().contacts).toEqual(expect.arrayContaining(people));
    const projected = await opened.app.inject({ method: 'GET', url: `${base}?owners=1`, headers: { cookie } });
    expect(projected.statusCode).toBe(200);
    const directoryName = await textColumn(opened.exec, `select name as value from users where id = '${buyer.id}'`);
    expect(projected.json()).toMatchObject({ ownerName: directoryName, contacts: expect.arrayContaining(people) });
  } finally {
    await opened.close();
  }
});

it('旧模板替换 BOM 后保留现有子件的负责人，已删除子件重新导入时不恢复旧负责人', async () => {
  const opened = await open();
  try {
    await importCsv(opened.imports, archiveFile);
    const retained = '9900000001';
    const removed = '9900000002';
    const upload = (parts: readonly string[], version: string) => importCsv(opened.imports, {
      fileName: 'bom.csv', template: 'bom-v1',
      bytes: csvBytes([BOM_COLUMNS, ...parts.map((part) => [barcode, '合成产品', 1, 100, part, `合成子件 ${part} ${version}`])]),
    });
    await upload([retained, removed], '初版');
    const id = await productId(opened.exec, barcode);
    const cookie = await loginAs(opened.app, 'admin');
    const base = `/api/v1/products/${id}`;
    for (const [partCodeRaw, ownerName] of [[retained, '保留甲'], [removed, '删除乙']]) {
      const response = await opened.app.inject({ method: 'PUT', url: `${base}/owner`, headers: { cookie }, payload: { partCodeRaw, ownerName } });
      expect(response.statusCode).toBe(200);
    }
    const getParts = async () => {
      const response = await opened.app.inject({ method: 'GET', url: `${base}/materials?owners=1`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      return response.json().parts;
    };
    await upload([retained], '移除版');
    expect(await getParts()).toMatchObject([{ partCodeRaw: retained, ownerName: '保留甲' }]);
    await upload([retained, removed], '恢复版');
    expect(await getParts()).toMatchObject([
      { partCodeRaw: retained, ownerName: '保留甲' },
      { partCodeRaw: removed, ownerName: null },
    ]);
  } finally {
    await opened.close();
  }
});

it('条码精确匹配排在分页之前，相关规格可翻到下一页', async () => {
  const opened = await open();
  try {
    await opened.exec(`insert into products (id, sku_name, barcode_raw, barcode_base, field_sources, created_at, updated_at)
      select 'variant-' || i, '合成相关规格', '780012-' || i, '780012', '{}', now(), now() from generate_series(1, 50) as i`);
    await opened.exec(`insert into products (id, sku_name, barcode_raw, barcode_base, filing_no, field_sources, created_at, updated_at)
      values ('zz-exact-code', '合成精确条码', '780012', '780012', '合成备案编号A-002', '{}', now(), now())`);
    const cookie = await loginAs(opened.app, 'reviewer');
    const list = (page: number, filing = false) => opened.app.inject({ method: 'GET', url: `/api/v1/products?q=780012&page=${page}${filing ? '&filing=1' : ''}`, headers: { cookie } });
    const first = (await list(1)).json();
    const next = (await list(2)).json();
    expect(first.page).toEqual({ page: 1, pageSize: 50, total: 51 });
    expect(first.items[0].barcodeRaw).toEqual('780012');
    expect(first.items[0]).not.toHaveProperty('filingNo');
    const withFilingNo = (await list(1, true)).json();
    expect(withFilingNo.items[0]).toMatchObject({ barcodeRaw: '780012', filingNo: '合成备案编号A-002' });
    expect(withFilingNo.items[1]).toMatchObject({ filingNo: null });
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

it('产品和精确 BOM 子件的负责人可独立指定、修改与清除，采购只能读', async () => {
  const opened = await open();
  try {
    await importCsv(opened.imports, archiveFile);
    await importCsv(opened.imports, { fileName: 'bom.csv', bytes: demoBom(), template: 'bom-v1' });
    await opened.exec(`
      INSERT INTO bom_lines (product_barcode_raw, product_name, part_code_raw, part_name, import_batch_id, row_no, merged_fill)
      SELECT '${barcode}-2', product_name, part_code_raw, part_name, import_batch_id, row_no, merged_fill
      FROM bom_lines WHERE product_barcode_raw = '${barcode}'
    `);
    const id = await productId(opened.exec, barcode);
    const channel = await productId(opened.exec, `${barcode}-2`);
    const noBom = await productId(opened.exec, `${barcode}-3`);
    const admin = await loginAs(opened.app, 'admin');
    const reviewer = await loginAs(opened.app, 'reviewer');
    const buyerCookie = await loginAs(opened.app, 'buyer');
    const partCodeRaw = '9900000001';
    const base = `/api/v1/products/${id}`;
    const put = (cookie: string, { target = id, partCodeRaw = null, ownerName }: {
      readonly target?: string; readonly partCodeRaw?: string | null; readonly ownerName: string | null;
    }) => opened.app.inject({
      method: 'PUT', url: `/api/v1/products/${target}/owner`, headers: { cookie }, payload: { partCodeRaw, ownerName },
    });
    const get = async (url: string) => {
      const response = await opened.app.inject({ method: 'GET', url, headers: { cookie: buyerCookie } });
      expect(response.statusCode, url).toBe(200);
      return response.json();
    };
    expect(await get(`${base}?owners=1`)).toMatchObject({
      ownerName: '示例联系人', contacts: expect.arrayContaining([
        { role: 'product_info', people: [expect.objectContaining({ name: '示例联系人' })] },
      ]),
    });
    expect((await put(buyerCookie, { ownerName: '未授权写入' })).statusCode).toBe(403);
    expect((await put(admin, { ownerName: '   ' })).statusCode).toBe(400);
    expect((await put(admin, { ownerName: '名'.repeat(101) })).statusCode).toBe(400);
    expect((await put(admin, { target: noBom, partCodeRaw, ownerName: '错误子件' })).statusCode).toBe(404);
    expect((await put(admin, { partCodeRaw: `${partCodeRaw} `, ownerName: '错误子件' })).statusCode).toBe(404);

    const assigned = await put(admin, { ownerName: '  合成成品甲  ' });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json()).toEqual({ ownerName: '合成成品甲' });
    expect((await put(reviewer, { partCodeRaw, ownerName: '合成子件甲' })).statusCode).toBe(200);
    expect(await get(`${base}?owners=1`)).toMatchObject({ ownerName: '合成成品甲' });
    expect(await get(`${base}/materials?owners=1`)).toMatchObject({ parts: [{ partCodeRaw, ownerName: '合成子件甲' }] });
    expect(await get(`/api/v1/products/${channel}/materials?owners=1`)).toMatchObject({ parts: [{ partCodeRaw, ownerName: null }] });
    expect(await get(`/api/v1/products?q=${barcode}&owners=1&pageSize=1`))
      .toMatchObject({ items: [{ barcodeRaw: barcode, ownerName: '合成成品甲' }], page: { total: 3 } });
    expect(await get(`/api/v1/products?q=${barcode}&owners=1`)).toMatchObject({ items: expect.arrayContaining([
      expect.objectContaining({ barcodeRaw: `${barcode}-2`, ownerName: '示例联系人' }),
    ]) });

    expect((await get(`/api/v1/products?q=${barcode}&pageSize=1`)).items[0]).not.toHaveProperty('ownerName');
    expect(await get(base)).not.toHaveProperty('ownerName');
    expect((await get(`${base}/materials`)).parts[0]).not.toHaveProperty('ownerName');

    expect((await put(admin, { partCodeRaw, ownerName: '合成子件乙' })).statusCode).toBe(200);
    expect(await get(`${base}/materials?owners=1`)).toMatchObject({ parts: [{ partCodeRaw, ownerName: '合成子件乙' }] });
    expect((await put(admin, { partCodeRaw, ownerName: null })).statusCode).toBe(200);
    expect((await put(admin, { ownerName: null })).statusCode).toBe(200);
    expect(await get(`${base}/materials?owners=1`)).toMatchObject({ parts: [{ partCodeRaw, ownerName: null }] });
    expect(await get(`${base}?owners=1`)).toMatchObject({ ownerName: null });
    expect(await textColumn(opened.exec, "select count(*)::text as value from audit_log where action = 'product.owner'")).toBe('5');
  } finally {
    await opened.close();
  }
});

it('原样保存项目推荐人时保留已有联系人关联和备注', async () => {
  const opened = await open();
  try {
    await importCsv(opened.imports, archiveFile);
    const id = await productId(opened.exec, barcode);
    const cookie = await loginAs(opened.app, 'admin');
    const url = `/api/v1/products/${id}`;
    const headers = { cookie };
    const userId = '0199f0a0-0000-7000-8000-000000000004';
    const saved = await opened.app.inject({ method: 'PUT', url: `${url}/contacts`, headers, payload: {
      role: 'product_info', people: [{ userId, nameRaw: '合成历史姓名', note: '合成联系电话记录' }, { nameRaw: '另一推荐人' }],
    } });
    expect(saved.statusCode).toBe(200);
    const initial = (await opened.app.inject({ method: 'GET', url: `${url}?owners=1`, headers })).json();
    expect(initial.ownerName).toContain('审核人甲');
    expect(initial.ownerName).toContain('另一推荐人');
    expect(initial.contacts).toEqual(expect.arrayContaining([{ role: 'product_info', people: expect.arrayContaining([
      expect.objectContaining({ userId, note: '合成联系电话记录' }),
    ]) }]));

    const result = await opened.app.inject({ method: 'PUT', url: `${url}/owner`, headers, payload: { partCodeRaw: null, ownerName: initial.ownerName } });
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({ ownerName: initial.ownerName });
    const current = (await opened.app.inject({ method: 'GET', url: `${url}?owners=1`, headers })).json();
    expect(current.contacts).toEqual(initial.contacts);
    expect(await textColumn(opened.exec, "select count(*)::text as value from audit_log where action = 'product.owner'")).toBe('0');
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
