import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { devAuth } from '@sw/auth';
import { createDb, migrate, seed, userDirectory } from '@sw/persistence';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import { composeFollowUp, followUpAttachmentMaxBytes } from '../src/composition/follow-up.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerFollowUpRoutes } from '../src/http/follow-up/routes.js';
import { loginAs } from './helpers/server.js';

it('采购批次保存报发、核实实际发收并可按原依据与作废记录回读', async () => {
  const clock = new FixedClock('2026-11-19T00:00:00.000Z');
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-fulfillment-'));
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle);
  await seed(handle.exec);
  const api = composeFollowUp({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai', clock });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => registerFollowUpRoutes({ app: server, api, attachmentMaxBytes: followUpAttachmentMaxBytes() }),
  });
  try {
    const cookie = await loginAs(app, 'buyer');
    const reviewer = await loginAs(app, 'reviewer');
    const post = (url: string, payload: Record<string, unknown>) => app.inject({ method: 'POST', url, headers: { cookie }, payload });
    const line = await post('/api/v1/lines', { lane: 'material', nameRaw: '共用盖子', qtyOrdered: 10000, unit: '件', receiverPartyId: 'recv-flow' });
    expect(line.statusCode).toBe(200);
    const lineId = line.json().line.id;
    const { id: batchId } = (await post(`/api/v1/lines/${lineId}/batches`, { plannedQty: 10000, receiverPartyId: 'recv-flow' })).json();
    const batch = `/api/v1/batches/${batchId}`;
    const read = async () => {
      const out = await app.inject({ method: 'GET', url: `/api/v1/lines/${lineId}`, headers: { cookie } });
      expect(out.statusCode).toBe(200);
      return out.json().batches[0];
    };
    const day = '2026-11-19';
    const send = { qty: 5000, shippedOn: day, fulfillment: { kind: 'verified', unit: '件', evidence: '交运单 T20261119' } };
    const receive = { qty: 2000, receivedOn: day, category: 'packaging', fulfillment: { kind: 'received', unit: '件', evidence: '签收单 R20261119', disposition: 'normal' } };
    expect((await app.inject({ method: 'POST', url: `${batch}/shipments`, headers: { cookie: reviewer }, payload: send })).statusCode).toBe(403);
    expect((await post(`${batch}/shipments`, { ...send, fulfillment: { ...send.fulfillment, evidence: ' ' } })).statusCode).toBe(400);
    await app.inject({ method: 'PATCH', url: batch, headers: { cookie }, payload: { dateSupplierPromised: '2026-11-20' } });
    expect((await post('/api/v1/follow-ups', { orderLineId: lineId, batchId, kind: 'promise', text: '周五发 5,000 件' })).statusCode).toBe(200);
    const reported = await post(`${batch}/shipments`, { ...send, fulfillment: { kind: 'reported', unit: '件', evidence: '工厂消息 M1' } });
    expect(reported.statusCode).toBe(200);
    expect(await read()).toMatchObject({ status: 'awaiting_date', shippedQty: null, receivedQty: null, fulfillment: { unit: '件', unshippedQty: 10000, inTransitQty: 0, receivedQty: 0, reviewCount: 1 } });
    const linked = { ...send, fulfillment: { ...send.fulfillment, reportId: reported.json().id } };
    const shipped = await post(`${batch}/shipments`, linked);
    expect(shipped.statusCode).toBe(200);
    expect(shipped.json()).toMatchObject({ recordedAt: clock.now(), fulfillment: { ...linked.fulfillment, reviewReason: null } });
    expect((await post(`${batch}/shipments`, linked)).statusCode).toBe(409);
    const receipt = await post(`${batch}/receipts`, receive);
    expect(receipt.statusCode).toBe(200);
    const accepted = { unshippedQty: 5000, inTransitQty: 3000, receivedQty: 2000, reviewCount: 0 };
    expect(await read()).toMatchObject({ shippedQty: 5000, receivedQty: 2000, status: 'partially_received', fulfillment: accepted });

    const wrong = await post(`${batch}/receipts`, { ...receive, qty: 9, fulfillment: { ...receive.fulfillment, unit: '托' } });
    expect(wrong.statusCode).toBe(200);
    expect(wrong.json().fulfillment).toMatchObject({ unit: '托', reviewReason: 'unit_conflict' });
    expect(await read()).toMatchObject({ receivedQty: 2000, fulfillment: { unshippedQty: null, inTransitQty: null, receivedQty: null, verifiedReceivedQty: 2000, reviewCount: 1 } });
    const noUnit = await post(`${batch}/shipments`, { ...send, qty: 1, fulfillment: { ...send.fulfillment, unit: null } });
    expect(noUnit.json().fulfillment).toMatchObject({ unit: null, reviewReason: 'unit_missing' });
    const returned = await post(`${batch}/receipts`, { ...receive, qty: 5, fulfillment: { ...receive.fulfillment, disposition: 'return' } });
    expect(returned.json()).toMatchObject({ category: 'packaging', fulfillment: { disposition: 'return', reviewReason: 'receipt_disposition' } });
    clock.advance(11);
    expect((await post(`/api/v1/receipts/${wrong.json().id}/void`, { reason: '单位不符' })).statusCode).toBe(200);
    expect((await post(`/api/v1/shipments/${noUnit.json().id}/void`, { reason: '单位有误' })).statusCode).toBe(200);
    expect(await read()).toMatchObject({ fulfillment: { ...accepted, reviewCount: 1 } });

    expect((await post(`${batch}/shipments`, { ...send, qty: 7000 })).statusCode).toBe(200);
    expect((await post(`${batch}/receipts`, { ...receive, qty: 9000 })).statusCode).toBe(200);
    expect(await read()).toMatchObject({ fulfillment: { unshippedQty: 0, inTransitQty: 1000, receivedQty: 11000, overShippedQty: 2000, overReceivedQty: 1000 } });
    expect((await post(`/api/v1/shipments/${shipped.json().id}/void`, { reason: '交运单重复' })).statusCode).toBe(200);
    expect((await post(`/api/v1/receipts/${receipt.json().id}/void`, { reason: '签收单重复' })).statusCode).toBe(200);
    expect(await read()).toMatchObject({ fulfillment: { unshippedQty: 1000, inTransitQty: 0, receivedQty: 9000, receiptWithoutShipmentQty: 2000 } });
    const timeline = await app.inject({ method: 'GET', url: `/api/v1/lines/${lineId}/timeline`, headers: { cookie } });
    expect(timeline.json().events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'follow_up', followUpKind: 'promise', text: '周五发 5,000 件' }),
      expect.objectContaining({ id: reported.json().id, fulfillment: { kind: 'reported', unit: '件', evidence: '工厂消息 M1' } }),
      expect.objectContaining({ id: receipt.json().id, voided: true, fulfillment: { ...receive.fulfillment, reviewReason: null } }),
    ]));

    await post(`${batch}/shipments`, { qty: 10, shippedOn: day });
    await post(`${batch}/receipts`, { qty: 10, receivedOn: day, category: 'packaging' });
    expect(await read()).toMatchObject({ shippedQty: 7010, receivedQty: 9010, fulfillment: { unshippedQty: null, inTransitQty: null, receivedQty: null, verifiedReceivedQty: 9000, reviewCount: 4 } });

    for (const evidence of ['-', ' ／ ', '—']) {
      expect.soft((await post(`${batch}/shipments`, { ...send, fulfillment: { ...send.fulfillment, evidence } })).statusCode).toBe(409);
      expect.soft((await post(`${batch}/receipts`, { ...receive, fulfillment: { ...receive.fulfillment, evidence } })).statusCode).toBe(409);
    }
    const placeholderUnit = await post(`${batch}/shipments`, { ...send, qty: 1, fulfillment: { ...send.fulfillment, unit: '／' } });
    expect.soft(placeholderUnit.json().fulfillment).toMatchObject({ unit: null, reviewReason: 'unit_missing' });

    const tomorrow = '2026-11-20';
    expect.soft((await post(`${batch}/shipments`, { ...send, shippedOn: tomorrow })).statusCode).toBe(400);
    expect.soft((await post(`${batch}/receipts`, { ...receive, receivedOn: tomorrow })).statusCode).toBe(400);
    expect.soft((await post(`${batch}/shipments`, { qty: 1, shippedOn: tomorrow })).statusCode).toBe(200);
    expect.soft((await post(`${batch}/receipts`, { qty: 1, receivedOn: tomorrow, category: 'packaging' })).statusCode).toBe(200);
  } finally {
    await app.close();
    await handle.close();
    await rm(uploadDir, { recursive: true });
  }
});
