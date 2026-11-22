import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect } from 'vitest';
import { devAuth } from '@sw/auth';
import { createDb, migrate, seed, userDirectory } from '@sw/persistence';
import { FixedClock } from '../../../../packages/testkit/src/index.js';
import { composeFollowUp, followUpAttachmentMaxBytes } from '../../src/composition/follow-up.js';
import { composeImports } from '../../src/composition/imports.js';
import { composeToday } from '../../src/composition/today.js';
import { buildHttpApp, type HttpApp } from '../../src/http/app.js';
import { registerFollowUpRoutes } from '../../src/http/follow-up/routes.js';
import { registerImportRoutes } from '../../src/http/imports/routes.js';
import { registerTodayRoutes } from '../../src/http/today/routes.js';

export const TODAY = '2099-01-10T04:00:00.000Z';
export const RECEIVER = 'recv-today';

export async function open(todayClock?: Parameters<typeof composeToday>[0]['clock'], testDatabaseUrl?: string) {
  const handle = await createDb(testDatabaseUrl === undefined ? { driver: 'pglite' } : { driver: 'pg', url: testDatabaseUrl });
  await migrate(handle.exec);
  await seed(handle.exec);
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-today-'));
  const clock = new FixedClock(TODAY);
  const follow = composeFollowUp({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai', clock });
  const todayApi = composeToday({ db: handle.db, timeZone: 'Asia/Shanghai', clock: todayClock ?? clock });
  const imports = composeImports({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai' });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => {
      registerFollowUpRoutes({ app: server, api: follow, attachmentMaxBytes: followUpAttachmentMaxBytes() });
      registerTodayRoutes(server, todayApi);
      registerImportRoutes(server, imports);
    },
  });
  return { app, handle, exec: handle.exec, close: async () => { await app.close(); await handle.close(); await rm(uploadDir, { recursive: true }); } };
}

export async function createLine({ app, cookie, buyerUserId }: { readonly app: HttpApp; readonly cookie: string; readonly buyerUserId: string | undefined }): Promise<string> {
  const created = await app.inject({ method: 'POST', url: '/api/v1/lines', headers: { cookie }, payload: { lane: 'finished', nameRaw: '今日样品', qtyOrdered: 10, unit: '件', receiverPartyId: RECEIVER, ...(buyerUserId === undefined ? {} : { buyerUserId }) } });
  expect(created.statusCode).toBe(200);
  return lineIdOf(created.json());
}

export async function today({ app, cookie, scope, includePending }: { readonly app: HttpApp; readonly cookie: string; readonly scope: string; readonly includePending?: boolean }) {
  const url = `/api/v1/today?scope=${scope}${includePending === true ? '&includePending=true' : ''}`;
  const response = await app.inject({ method: 'GET', url, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return response.json();
}

export function lineIdOf(value: unknown): string {
  if (!isRecord(value) || !isRecord(value.line) || typeof value.line.id !== 'string') throw new Error('没有订单行');
  return value.line.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
