import { devAuth } from '@sw/auth';
import { ImportBatchSummarySchema, listResponseSchema, OrderLineDetailSchema, OrderLineRowSchema, ProcurementPreviewSelectionSchema } from '@sw/contracts';
import { createDb, migrate, seed, userDirectory, type AppHandle } from '@sw/persistence';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { composeFollowUp } from '../../src/composition/follow-up.js';
import { composeImports } from '../../src/composition/imports.js';
import { composeMasterData } from '../../src/composition/master-data.js';
import { composeToday } from '../../src/composition/today.js';
import { buildHttpApp, type HttpApp } from '../../src/http/app.js';
import { registerFollowUpRoutes } from '../../src/http/follow-up/routes.js';
import { registerImportRoutes } from '../../src/http/imports/routes.js';
import { registerMasterDataRoutes } from '../../src/http/master-data/routes.js';
import { registerTodayRoutes } from '../../src/http/today/routes.js';
import { loginAs } from './server.js';

export async function openProcurementImport(options?: { readonly isLocal: boolean }) {
  const testUrl = options?.isLocal === true ? undefined : process.env.CG03_TEST_DATABASE_URL;
  if (testUrl !== undefined) {
    const parsed = new URL(testUrl);
    if (parsed.hostname !== '127.0.0.1' || parsed.pathname !== '/cg03_proof') throw new Error('只允许使用 CG03 一次性 PostgreSQL 测试库');
  }
  const handle = await createDb(testUrl === undefined ? { driver: 'pglite' } : { driver: 'pg', url: testUrl });
  await migrate(handle.exec);
  await seed(handle.exec);
  await handle.exec("update users set name = '测试采购员 C' where id = '0199f0a0-0000-7000-8000-000000000002'");
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-procurement-test-'));
  const config = { db: handle.db, uploadDir, timeZone: 'Asia/Shanghai' };
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => {
      registerImportRoutes(server, composeImports(config));
      registerFollowUpRoutes({ app: server, api: composeFollowUp(config), attachmentMaxBytes: 1024 * 1024 });
      registerMasterDataRoutes(server, composeMasterData(config));
      registerTodayRoutes(server, composeToday(config));
    },
  });
  return { app, handle, close: async () => { await app.close(); await handle.close(); await rm(uploadDir, { recursive: true }); } };
}

export async function procurementImportClient(app: HttpApp, handle: AppHandle) {
  const cookie = await loginAs(app, 'buyer');
  return {
    app,
    cookie,
    concurrent: <T>(commands: readonly (() => Promise<T>)[]) => runConcurrent(handle, commands),
    upload: (name: string, bytes: Buffer) => uploadWorkbook({ app, cookie, name, bytes }),
    async commit(batch: { readonly id: string; readonly revision: number }, options?: { readonly key?: string; readonly cookie?: string; readonly revision?: number }) {
      return app.inject({
        method: 'POST', url: `/api/v1/imports/${batch.id}/commit`,
        headers: { cookie: options?.cookie ?? cookie, 'idempotency-key': options?.key ?? `commit-${batch.id}` },
        payload: { expectedRevision: options?.revision ?? batch.revision },
      });
    },
    async preview(batch: { readonly id: string }, oa = 'XPKA(CN)9901') {
      const response = await app.inject({ method: 'GET', url: `/api/v1/imports/${batch.id}/procurement?oa=${encodeURIComponent(oa)}`, headers: { cookie } });
      expect(response.statusCode, response.body).toBe(200);
      return must(ProcurementPreviewSelectionSchema.parse(response.json()));
    },
    async lines(query: string) {
      const response = await app.inject({ url: `/api/v1/lines?${query}`, headers: { cookie } });
      expect(response.statusCode, response.body).toBe(200);
      return response.json();
    },
    async scopedLines(store: string) {
      const response = await app.inject({ url: `/api/v1/lines?lane=finished&store=${store}`, headers: { cookie } });
      expect(response.statusCode, response.body).toBe(200);
      return listResponseSchema(OrderLineRowSchema).parse(response.json()).items;
    },
    async detail(lineId: string, store?: string) {
      const query = store === undefined ? '' : `?store=${store}`;
      const response = await app.inject({ method: 'GET', url: `/api/v1/lines/${encodeURIComponent(lineId)}${query}`, headers: { cookie } });
      expect(response.statusCode, response.body).toBe(200);
      return OrderLineDetailSchema.parse(response.json());
    },
  };
}

async function uploadWorkbook({ app, cookie, name, bytes }: {
  readonly app: HttpApp;
  readonly cookie: string;
  readonly name: string;
  readonly bytes: Buffer;
}) {
  const boundary = '----sw-procurement';
  const detected = await app.inject({
    method: 'POST', url: '/api/v1/imports/detect',
    headers: { cookie, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
      bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  });
  expect(detected.statusCode, detected.body).toBe(200);
  const started = await app.inject({ method: 'POST', url: '/api/v1/imports', headers: { cookie }, payload: { fileId: detected.json<{ readonly fileId: string }>().fileId, template: 'po-master-v1' } });
  expect(started.statusCode, started.body).toBe(200);
  const batch = ImportBatchSummarySchema.parse(started.json());
  return { ...batch, revision: batch.revision ?? 0 };
}

async function runConcurrent<T>(handle: AppHandle, commands: readonly (() => Promise<T>)[]): Promise<readonly T[]> {
  const run = () => Promise.all(commands.map((command) => command()));
  if (handle.driver !== 'pg') return run();
  const session = await handle.session();
  try {
    await session.exec('begin');
    await session.exec("select pg_advisory_xact_lock(hashtext('supply'), hashtext('po-master-commit'))");
    const pending = run();
    await expect.poll(() => handle.exec(`
      select count(*)::int as waiting from pg_stat_activity
      where datname = current_database() and wait_event = 'advisory' and query like '%po-master-commit%'
    `)).toMatchObject({ rows: [{ waiting: commands.length }] });
    return pending;
  } finally {
    await session.exec('rollback');
    session.release();
  }
}

export function must<T>(value: T | null | undefined): T {
  if (value == null) throw new Error('找不到预期的采购记录');
  return value;
}
