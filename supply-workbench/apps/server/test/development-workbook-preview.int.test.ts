import { devAuth } from '@sw/auth';
import { DevelopmentWorkbookPreviewSchema } from '@sw/contracts';
import { createDb, migrate, seed, userDirectory } from '@sw/persistence';
import { expect, it } from 'vitest';
import { developmentWorkbook } from '../../../test/importers/fixtures/development-workbook.js';
import { composeProductDevelopment } from '../src/composition/product-development.js';
import { buildHttpApp, type HttpApp } from '../src/http/app.js';
import { registerProductDevelopmentRoutes } from '../src/http/product-development/routes.js';
import { loginAs } from './helpers/server.js';

const PREVIEW = '/api/v1/product-development/workbook/preview';
const BOUNDARY = 'synthetic-development-preview';

function upload(app: HttpApp, input: { readonly bytes: Uint8Array; readonly cookie?: string; readonly url?: string; readonly fileName?: string }) {
  const { cookie, bytes, url = `${PREVIEW}?store=dafuyan`, fileName = '合成新品.xlsx' } = input;
  return app.inject({
    method: 'POST', url,
    headers: { ...cookie === undefined ? {} : { cookie }, 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    payload: Buffer.concat([
      Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]),
  });
}

it('预览服从创建项目权限，响应不可缓存，且重复上传不创建项目', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => registerProductDevelopmentRoutes(server, composeProductDevelopment({ db: handle.db, timeZone: 'Asia/Shanghai' })),
  });
  try {
    const reviewer = await loginAs(app, 'reviewer');
    const buyer = await loginAs(app, 'buyer');
    const bytes = developmentWorkbook();
    const list = async () => (await app.inject({ url: '/api/v1/product-development?store=dafuyan', headers: { cookie: reviewer } })).json();
    const before = await list();
    expect(before).toMatchObject({ canCreateProject: true, projects: expect.any(Array) });
    const noSession = await upload(app, { bytes });
    expect(noSession.statusCode).toBe(401);
    const disallowed = await upload(app, { bytes, cookie: buyer });
    expect(disallowed.statusCode).toBe(403);
    expect(disallowed.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    const allowed = await upload(app, { bytes, cookie: reviewer });
    expect(allowed.statusCode, allowed.body).toBe(200);
    expect(allowed.headers['cache-control']).toBe('private, no-store');
    const preview = DevelopmentWorkbookPreviewSchema.parse(allowed.json());
    expect(preview.fileName).toBe('合成新品.xlsx');
    expect(preview.candidates).toHaveLength(5);
    expect((await upload(app, { bytes, cookie: reviewer })).json()).toEqual(preview);
    expect(await list()).toEqual(before);
    const missingStore = await upload(app, { bytes, cookie: reviewer, url: PREVIEW });
    expect(missingStore.statusCode).toBe(400);
    const wrongType = await upload(app, { bytes, cookie: reviewer, fileName: '合成.csv' });
    expect(wrongType.json()).toMatchObject({ error: { code: 'FILE_TYPE_NOT_ALLOWED' } });
    const invalidBook = await upload(app, { bytes: Buffer.from('not a workbook'), cookie: reviewer });
    expect(invalidBook.statusCode).toBe(400);
    const oversized = await upload(app, { bytes: Buffer.alloc(4 * 1024 * 1024 + 1), cookie: reviewer });
    expect(oversized.json()).toMatchObject({ error: { code: 'FILE_TOO_LARGE' } });
  } finally {
    await app.close();
    await handle.close();
  }
});
