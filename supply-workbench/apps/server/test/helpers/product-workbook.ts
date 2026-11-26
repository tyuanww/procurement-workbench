import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { devAuth } from '@sw/auth';
import { ProductWorkbookPreviewSchema } from '@sw/contracts';
import { createDb, fileStoreWithProductWorkbookImages, migrate, seed, userDirectory, type SqlExec } from '@sw/persistence';
import { expect } from 'vitest';
import { composeProductArchive, productAttachmentMaxBytes } from '../../src/composition/product-archive.js';
import { composePlatform, platformHealth } from '../../src/composition/platform.js';
import { buildHttpApp } from '../../src/http/app.js';
import { registerPlatformRoutes } from '../../src/http/platform/routes.js';
import { registerProductRoutes } from '../../src/http/product-archive/routes.js';
import { loginAs } from './server.js';

const requireImporter = createRequire(new URL('../../../../packages/importers/package.json', import.meta.url));
const XLSX = requireImporter('xlsx');
const { unzipSync, zipSync } = requireImporter('fflate');
export const BARCODE = '0690000012345';
export const CHANNEL = `${BARCODE}-2`;
export const OTHER_CHANNEL = `${BARCODE}-3`;
export const PART = '9900000001';
export const KEEP_PART = '9900000002';
const PRODUCT_COLUMNS = ['SKU名称', '产品条码', '项目推荐人', '项目对接人', '净含量', '外包装图片', '外包装图片操作'];
const MATERIAL_COLUMNS = ['产品条码', '产品名称', '成品翻单次数', '累计数量', '子件条码', '子件名称', '负责人', '操作'];
export const ROUTE = '/api/v1/products/workbook-channel/workbook-imports';
export const BASE_ROUTE = '/api/v1/products/workbook-base/workbook-imports';
export const CATALOG_ROUTE = '/api/v1/products/workbook-imports';
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XobYQAAAAASUVORK5CYII=', 'base64');

type Row = readonly (string | number)[];
export function pack(products: readonly Row[], options: { readonly bom?: readonly Row[]; readonly image?: boolean; readonly replacement?: boolean; readonly legacy?: boolean } = {}): Buffer {
  const file = XLSX.utils.book_new();
  const columns = options.legacy ? PRODUCT_COLUMNS.map((header) => header === '项目推荐人' ? '备案名称' : header) : PRODUCT_COLUMNS;
  XLSX.utils.book_append_sheet(file, XLSX.utils.aoa_to_sheet([columns, ...products]), '产品档案');
  XLSX.utils.book_append_sheet(file, XLSX.utils.aoa_to_sheet([MATERIAL_COLUMNS, ...(options.bom ?? [])]), options.legacy ? '图片索引' : '组成物料');
  const bytes: Buffer = XLSX.write(file, { type: 'buffer', bookType: 'xlsx' });
  if (!options.image) return bytes;
  return embed(bytes, options.replacement ?? false);
}

function embed(bytes: Buffer, replacement: boolean): Buffer {
  const files: Record<string, Uint8Array> = unzipSync(bytes);
  files['xl/worksheets/_rels/sheet1.xml.rels'] = Buffer.from('<Relationships><Relationship Target="/xl/drawings/drawing1.xml" Id="rId1"/></Relationships>');
  files['xl/drawings/_rels/drawing1.xml.rels'] = Buffer.from('<Relationships><Relationship Target="/xl/media/image.png" Id="rId1"/></Relationships>');
  files['xl/drawings/drawing1.xml'] = Buffer.from('<wsDr><oneCellAnchor><from><col>5</col><row>1</row></from><pic><a:blip r:embed="rId1"/></pic></oneCellAnchor></wsDr>');
  files['xl/media/image.png'] = replacement ? Buffer.concat([PNG, Buffer.from([0])]) : PNG;
  return Buffer.from(zipSync(files));
}

export async function open() {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  await seedWorkbookProducts(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-product-workbook-'));
  const api = composeProductArchive({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai' });
  const files = fileStoreWithProductWorkbookImages(uploadDir, handle.db);
  const platform = composePlatform({ db: handle.db, timeZone: 'Asia/Shanghai', weeklyCron: null, files, health: () => platformHealth(handle.exec) });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => {
      registerPlatformRoutes({ app: server, api: platform.api, devLogin: true, businessTimeZone: 'Asia/Shanghai' });
      registerProductRoutes({ app: server, api, attachmentMaxBytes: productAttachmentMaxBytes() });
    },
  });
  const buyer = await loginAs(app, 'buyer');
  const reviewer = await loginAs(app, 'reviewer');
  const manager = await loginAs(app, 'manager');
  const uploadResponse = (bytes: Buffer, { cookie = buyer, url = ROUTE }: { readonly cookie?: string; readonly url?: string } = {}) => app.inject({
    method: 'POST', url, headers: { cookie, 'content-type': 'multipart/form-data; boundary=sw-workbook-test' },
    payload: Buffer.concat([
      Buffer.from('--sw-workbook-test\r\nContent-Disposition: form-data; name="file"; filename="synthetic.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n'),
      bytes, Buffer.from('\r\n--sw-workbook-test--\r\n'),
    ]),
  });
  const commitResponse = (id: string, cookie = buyer) => app.inject({ method: 'POST', url: `${ROUTE}/${id}/commit`, headers: { cookie } });
  return {
    app, handle, files, buyer, manager, reviewer, uploadResponse, commitResponse,
    upload: async (bytes: Buffer) => result(await uploadResponse(bytes)),
    commit: async (id: string) => result(await commitResponse(id)),
    get: async (id: string) => result(await app.inject({ url: `${ROUTE}/${id}`, headers: { cookie: buyer } })),
    read: async (url: string) => (await app.inject({ url, headers: { cookie: buyer } })).json(),
    close: async () => { await app.close(); await handle.close(); await rm(uploadDir, { recursive: true }); },
  };
}

async function seedWorkbookProducts(exec: SqlExec): Promise<void> {
  await exec(`
    INSERT INTO products (id, sku_name, barcode_raw, barcode_base, case_pack, field_sources, created_at, updated_at) VALUES
      ('workbook-base', '基础合成装', '${BARCODE}', '${BARCODE}', NULL, '{}', now(), now()),
      ('workbook-channel', '渠道合成装', '${CHANNEL}', '${BARCODE}', '12盒/箱', '{}', now(), now());
    INSERT INTO product_contacts (product_id, role, name_raw, source, updated_by, updated_at) VALUES
      ('workbook-base', 'product_info', '基础款推荐人', 'import', 'test', now()),
      ('workbook-channel', 'product_info', '渠道旧推荐人', 'import', 'test', now());
    INSERT INTO bom_lines (product_barcode_raw, product_name, reorder_count, cumulative_qty, part_code_raw, part_name, import_batch_id, row_no, merged_fill) VALUES
      ('${BARCODE}', '基础合成装', 1, 500, '${PART}', '基础款配件', 'test', 2, false),
      ('${BARCODE}', '基础合成装', NULL, NULL, '${KEEP_PART}', '保留配件', 'test', 3, false);
    INSERT INTO product_archive_owners (product_id, part_code_raw, owner_name) VALUES ('workbook-base', '${PART}', '基础款旧负责人');
  `);
}

export function result(response: { readonly statusCode: number; readonly body: string }) {
  expect(response.statusCode, response.body).toBe(200);
  return ProductWorkbookPreviewSchema.parse(JSON.parse(response.body));
}
