import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { devAuth } from '@sw/auth';
import { BatchViewSchema, FollowUpViewSchema, LatestNotesSchema, LineTimelineSchema } from '@sw/contracts';
import { createDb, migrate, seed, userDirectory } from '@sw/persistence';
import type { Role } from '@sw/domain';
import { expect, it } from 'vitest';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import { composeFollowUp, followUpAttachmentMaxBytes } from '../src/composition/follow-up.js';
import { buildHttpApp, type HttpApp } from '../src/http/app.js';
import { registerFollowUpRoutes } from '../src/http/follow-up/routes.js';
import { loginAs } from './helpers/server.js';

const WAREHOUSE = '0199f0a0-0000-7000-8000-000000000010';
const SECRET = '0123456789abcdef0123456789abcdef';

it('同一时刻后写的备注仍是最新', async () => {
  const opened = await openApp();
  try {
    const buyer = await loginAs(opened.app, 'buyer');
    const lineId = await createLine({ app: opened.app, cookie: buyer, name: '同时刻' });
    await writeFollow({ app: opened.app, cookie: buyer, input: { orderLineId: lineId, kind: 'note', text: '先写的' } });
    await writeFollow({ app: opened.app, cookie: buyer, input: { orderLineId: lineId, kind: 'note', text: '后写的' } });
    const read = await opened.app.inject({
      method: 'POST',
      url: '/api/v1/follow-ups/latest-notes',
      headers: { cookie: buyer },
      payload: { orderLineIds: [lineId] },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().items).toEqual([{ orderLineId: lineId, text: '后写的' }]);
  } finally {
    await opened.close();
  }
});

it('批次备注保留在时间线，订单行只显示自身最新备注', async () => {
  const { app, clock, close } = await openApp();
  try {
    const cookie = await loginAs(app, 'buyer');
    const orderLineId = await createLine({ app, cookie, name: '分批跟进' });
    const batch = await app.inject({
      method: 'POST', url: `/api/v1/lines/${orderLineId}/batches`, headers: { cookie },
      payload: { plannedQty: 10, receiverPartyId: WAREHOUSE, dateBuyerConfirmed: '2026-10-20' },
    });
    expect(batch.statusCode).toBe(200);
    const batchId = BatchViewSchema.parse(batch.json()).id;
    const lineNote = await writeFollow({ app, cookie, input: { orderLineId, kind: 'note', text: '整笔订单等待确认' } });
    clock.advance(1);
    const batchNote = await writeFollow({ app, cookie, input: { orderLineId, batchId, kind: 'note', text: '这批等待承运回复' } });
    const readNotes = async () => {
      const read = await app.inject({
        method: 'POST', url: '/api/v1/follow-ups/latest-notes', headers: { cookie },
        payload: { orderLineIds: [orderLineId] },
      });
      expect(read.statusCode).toBe(200);
      return LatestNotesSchema.parse(read.json()).items;
    };
    expect(await readNotes()).toEqual([{ orderLineId, text: lineNote.text }]);

    const history = await app.inject({ url: `/api/v1/lines/${orderLineId}/timeline`, headers: { cookie } });
    expect(history.statusCode).toBe(200);
    expect(LineTimelineSchema.parse(history.json()).events).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: lineNote.id, batchId: null, text: lineNote.text }),
      expect.objectContaining({ id: batchNote.id, batchId, text: batchNote.text }),
    ]));

    const undo = await app.inject({ method: 'DELETE', url: `/api/v1/follow-ups/${lineNote.id}`, headers: { cookie } });
    expect(undo.statusCode).toBe(204);
    expect(await readNotes()).toEqual([]);
  } finally {
    await close();
  }
});

it('一次取回每行最新进度说明，审核、管理、主管不能写', async () => {
  const opened = await openApp();
  try {
    const buyer = await loginAs(opened.app, 'buyer');
    const first = await createLine({ app: opened.app, cookie: buyer, name: '面膜' });
    const second = await createLine({ app: opened.app, cookie: buyer, name: '棉片' });
    const callOnly = await createLine({ app: opened.app, cookie: buyer, name: '只有电话' });
    await writeFollow({ app: opened.app, cookie: buyer, input: { orderLineId: first, kind: 'note', text: '旧说明' } });
    opened.clock.advance(1);
    await writeFollow({ app: opened.app, cookie: buyer, input: { orderLineId: first, kind: 'note', text: '催工厂回单' } });
    opened.clock.advance(1);
    await writeFollow({ app: opened.app, cookie: buyer, input: { orderLineId: first, kind: 'call', text: '电话' } });
    opened.clock.advance(1);
    await writeFollow({ app: opened.app, cookie: buyer, input: { orderLineId: second, kind: 'note', text: '另一行' } });
    await writeFollow({ app: opened.app, cookie: buyer, input: { orderLineId: callOnly, kind: 'call', text: '只打了电话' } });
    const read = await opened.app.inject({
      method: 'POST',
      url: '/api/v1/follow-ups/latest-notes',
      headers: { cookie: buyer },
      payload: { orderLineIds: [first, second, callOnly, first, 'missing'] },
    });
    expect(read.statusCode).toBe(200);
    expect(notesOf(read.json())).toEqual(sortedNotes([
      [first, '催工厂回单'],
      [second, '另一行'],
    ]));
    await expectReadOnly(opened.app, first);
    const empty = await opened.app.inject({
      method: 'POST',
      url: '/api/v1/follow-ups/latest-notes',
      headers: { cookie: buyer },
      payload: { orderLineIds: [] },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ items: [] });
    const tooMany = await opened.app.inject({
      method: 'POST',
      url: '/api/v1/follow-ups/latest-notes',
      headers: { cookie: buyer },
      payload: { orderLineIds: Array.from({ length: 201 }, (_, index) => `id-${index}`) },
    });
    expect(tooMany.statusCode).toBe(400);
    expect(tooMany.json().error.code).toBe('VALIDATION_FAILED');
  } finally {
    await opened.close();
  }
});

async function expectReadOnly(app: HttpApp, lineId: string): Promise<void> {
  const roles: readonly Role[] = ['reviewer', 'manager', 'lead'];
  for (const role of roles) {
    const cookie = await loginAs(app, role);
    const allowed = await app.inject({
      method: 'POST',
      url: '/api/v1/follow-ups/latest-notes',
      headers: { cookie },
      payload: { orderLineIds: [lineId] },
    });
    expect(allowed.statusCode).toBe(200);
    expect(notesOf(allowed.json())).toEqual([[lineId, '催工厂回单']]);
    const denied = await app.inject({
      method: 'POST',
      url: '/api/v1/follow-ups',
      headers: { cookie },
      payload: { orderLineId: lineId, kind: 'note', text: '不该写上' },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');
  }
}

function notesOf(body: { readonly items?: readonly { readonly orderLineId?: string; readonly text?: string }[] }): string[][] {
  return sortedNotes((body.items ?? []).map((item) => [item.orderLineId ?? '', item.text ?? '']));
}

function sortedNotes(rows: readonly (readonly string[])[]): string[][] {
  return rows.map((row) => [...row]).sort((left, right) => (left[0] ?? '').localeCompare(right[0] ?? ''));
}

async function createLine({ app, cookie, name }: { readonly app: HttpApp; readonly cookie: string; readonly name: string }): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/lines',
    headers: { cookie },
    payload: { lane: 'finished', nameRaw: name, qtyOrdered: 10, receiverPartyId: WAREHOUSE },
  });
  expect(response.statusCode).toBe(200);
  const id = response.json().line.id;
  if (typeof id !== 'string') throw new Error('没有订单行');
  return id;
}

async function writeFollow({ app, cookie, input }: { readonly app: HttpApp; readonly cookie: string; readonly input: { readonly orderLineId: string; readonly batchId?: string; readonly kind: 'note' | 'call'; readonly text: string } }) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/follow-ups',
    headers: { cookie },
    payload: input,
  });
  expect(response.statusCode).toBe(200);
  return FollowUpViewSchema.parse(response.json());
}

async function openApp() {
  const clock = new FixedClock('2026-10-13T00:00:00.000Z');
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-notes-'));
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const api = composeFollowUp({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai', clock });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: SECRET }),
    register: (server) => registerFollowUpRoutes({ app: server, api, attachmentMaxBytes: followUpAttachmentMaxBytes() }),
  });
  return {
    app,
    clock,
    close: async () => {
      await app.close();
      await handle.close();
      await rm(uploadDir, { recursive: true });
    },
  };
}
