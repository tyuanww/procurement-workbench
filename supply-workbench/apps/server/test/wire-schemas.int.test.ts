import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { devAuth } from '@sw/auth';
import {
  BatchViewSchema,
  DetectResponseSchema,
  HintBatchResultSchema,
  OrderLineDetailSchema,
  PartyAliasViewSchema,
  ReceiptViewSchema,
  SearchResultSchema,
  MeResponseSchema,
  SessionUserSchema,
  ShipmentViewSchema,
  UpdatedCountSchema,
  listResponseSchema,
} from '@sw/contracts';
import { createDb, fileStore, migrate, seed, userDirectory } from '@sw/persistence';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import { composeFollowUp, followUpAttachmentMaxBytes } from '../src/composition/follow-up.js';
import { composeImports } from '../src/composition/imports.js';
import { composeMasterData } from '../src/composition/master-data.js';
import { composePlatform, platformHealth } from '../src/composition/platform.js';
import { composeSearch } from '../src/composition/search.js';
import { buildHttpApp, type HttpApp } from '../src/http/app.js';
import { registerFollowUpRoutes } from '../src/http/follow-up/routes.js';
import { registerImportRoutes } from '../src/http/imports/routes.js';
import { registerMasterDataRoutes } from '../src/http/master-data/routes.js';
import { registerPlatformRoutes } from '../src/http/platform/routes.js';
import { registerSearchRoutes } from '../src/http/search/routes.js';

const SECRET = '0123456789abcdef0123456789abcdef';
const CODE = 'dev-code';
const BUYER_ID = '0199f0a0-0000-7000-8000-000000000002';
const REVIEWER_ID = '0199f0a0-0000-7000-8000-000000000004';

it('真实接口响应能通过契约 schema', async () => {
  const opened = await open();
  try {
    const cookie = await expectSession(opened.app);
    const lineId = await expectLine(opened.app, cookie);
    await expectBatches({ app: opened.app, clock: opened.clock, cookie, lineId });
    await expectLists(opened.app, cookie);
  } finally {
    await opened.close();
  }
}, 120000);

async function open() {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-wire-'));
  const clock = new FixedClock('2026-10-13T00:00:00.000Z');
  const followUp = composeFollowUp({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai', clock });
  const imports = composeImports({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai' });
  const master = composeMasterData({ db: handle.db, timeZone: 'Asia/Shanghai' });
  const platform = composePlatform({ db: handle.db, timeZone: 'Asia/Shanghai', weeklyCron: null, files: fileStore(uploadDir), health: () => platformHealth(handle.exec) });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: CODE, secret: SECRET }),
    register: (server) => {
      registerPlatformRoutes({ app: server, api: platform.api, devLogin: true, businessTimeZone: 'Asia/Shanghai' });
      registerImportRoutes(server, imports);
      registerFollowUpRoutes({ app: server, api: followUp, attachmentMaxBytes: followUpAttachmentMaxBytes() });
      registerMasterDataRoutes(server, master);
      registerSearchRoutes(server, composeSearch({ db: handle.db }));
    },
  });
  return { app, clock, close: async () => { await app.close(); await handle.close(); await rm(uploadDir, { recursive: true }); } };
}

async function expectSession(app: HttpApp): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: BUYER_ID, accessCode: CODE } });
  expectWire(SessionUserSchema, login);
  const cookie = cookieOf(login);
  expectWire(MeResponseSchema, await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } }));
  return cookie;
}

async function expectLine(app: HttpApp, cookie: string): Promise<string> {
  const created = await app.inject({ method: 'POST', url: '/api/v1/lines', headers: { cookie }, payload: { lane: 'finished', nameRaw: '面膜', qtyOrdered: 10, receiverPartyId: 'recv-flow' } });
  expectWire(OrderLineDetailSchema, created);
  const lineId = textAt({ value: created.json(), parent: 'line', key: 'id' });
  const patched = await app.inject({ method: 'PATCH', url: `/api/v1/lines/${lineId}`, headers: { cookie }, payload: { buyerUserId: BUYER_ID } });
  expectWire(OrderLineDetailSchema, patched);
  return lineId;
}

async function expectBatches(input: { readonly app: HttpApp; readonly clock: FixedClock; readonly cookie: string; readonly lineId: string }): Promise<void> {
  const { app, clock, cookie, lineId } = input;
  const created = await app.inject({ method: 'POST', url: `/api/v1/lines/${lineId}/batches`, headers: { cookie }, payload: { plannedQty: 10, receiverPartyId: 'recv-flow', dateBuyerConfirmed: '2026-10-20' } });
  expectWire(BatchViewSchema, created);
  const batchId = textOf(created.json(), 'id');
  const patched = await app.inject({ method: 'PATCH', url: `/api/v1/batches/${batchId}`, headers: { cookie }, payload: { dateBuyerConfirmed: '2026-10-21', reason: '改期' } });
  expectWire(BatchViewSchema, patched);
  const shipment = await app.inject({ method: 'POST', url: `/api/v1/batches/${batchId}/shipments`, headers: { cookie }, payload: { qty: 2, shippedOn: '2026-10-18' } });
  expectWire(ShipmentViewSchema, shipment);
  clock.advance(11);
  expectWire(ShipmentViewSchema, await app.inject({ method: 'POST', url: `/api/v1/shipments/${textOf(shipment.json(), 'id')}/void`, headers: { cookie }, payload: { reason: '作废' } }));
  const receipt = await app.inject({ method: 'POST', url: `/api/v1/batches/${batchId}/receipts`, headers: { cookie }, payload: { qty: 1, receivedOn: '2026-10-19', category: 'finished' } });
  expectWire(ReceiptViewSchema, receipt);
  expectWire(UpdatedCountSchema, await app.inject({ method: 'POST', url: '/api/v1/lines/bulk/assign', headers: { cookie }, payload: { lineIds: [lineId], buyerUserId: BUYER_ID } }));
  expectWire(HintBatchResultSchema, await app.inject({ method: 'POST', url: '/api/v1/lines/bulk/hint-batches', headers: { cookie }, payload: { lineIds: [lineId], includeCompleted: false } }));
}

async function expectLists(app: HttpApp, cookie: string): Promise<void> {
  const reviewer = await reviewerCookie(app);
  expectWire(listResponseSchema(PartyAliasViewSchema), await app.inject({ method: 'GET', url: '/api/v1/master/aliases?status=pending&pageSize=200', headers: { cookie: reviewer } }));
  expectWire(SearchResultSchema, await app.inject({ method: 'GET', url: `/api/v1/search?q=${encodeURIComponent('面膜')}`, headers: { cookie } }));
  const template = await app.inject({ method: 'GET', url: '/api/v1/templates/factory-progress-v1.xlsx', headers: { cookie } });
  expect(template.statusCode).toBe(200);
  const file = multipart('blank.xlsx', template.rawPayload);
  expectWire(DetectResponseSchema, await app.inject({ method: 'POST', url: '/api/v1/imports/detect', headers: { cookie, ...file.headers }, payload: file.body }));
}

function expectWire(schema: { safeParse(value: unknown): { success: boolean; error?: unknown } }, response: { statusCode: number; json(): unknown }): void {
  const body: unknown = response.json();
  const parsed = schema.safeParse(body);
  expect(response.statusCode, JSON.stringify(body)).toBe(200);
  expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error)).toBe(true);
}

async function reviewerCookie(app: HttpApp): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/dev/login', payload: { userId: REVIEWER_ID, accessCode: CODE } });
  const header = login.headers['set-cookie'];
  const value = Array.isArray(header) ? header[0] : header;
  return value?.split(';')[0] ?? '';
}

function cookieOf(response: Awaited<ReturnType<HttpApp['inject']>>): string {
  const header = response.headers['set-cookie'];
  if (typeof header === 'string') return header.split(';')[0] ?? '';
  if (!Array.isArray(header)) return '';
  const first = header[0];
  return typeof first === 'string' ? (first.split(';')[0] ?? '') : '';
}

function textOf(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null || !(key in value)) throw new Error(`没有 ${key}`);
  const field = Reflect.get(value, key);
  if (typeof field !== 'string') throw new Error(`没有 ${key}`);
  return field;
}

function textAt({ value, parent, key }: { readonly value: unknown; readonly parent: string; readonly key: string }): string {
  if (typeof value !== 'object' || value === null || !(parent in value)) throw new Error(`没有 ${parent}`);
  return textOf(Reflect.get(value, parent), key);
}

function multipart(fileName: string, body: Buffer) {
  const boundary = '----sw-wire';
  return {
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`),
      body,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}
