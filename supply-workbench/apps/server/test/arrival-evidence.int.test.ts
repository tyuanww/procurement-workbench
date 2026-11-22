import { expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { devAuth } from '@sw/auth';
import { auditQueries, migrate, seed, userDirectory } from '@sw/persistence';
import { FixedClock } from '../../../packages/testkit/src/index.js';
import { composeFollowUp, followUpAttachmentMaxBytes } from '../src/composition/follow-up.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerFollowUpRoutes } from '../src/http/follow-up/routes.js';
import { arrivalTestDatabase } from './helpers/arrival-database.js';
import { loginAs } from './helpers/server.js';

const base = '/api/v1/receipts/arrivals';
const day = '2026-11-19';
const warehouse = '0199f0a0-0000-7000-8000-000000000010';
const firstPo = 'PO20261119000081';
const secondPo = 'PO20261119000082';

it('待归单按来源去重，实收分配、更正和撤销保持一份有效凭据', async () => {
  const uploadDir = await mkdtemp(path.join(tmpdir(), 'sw-arrival-'));
  const handle = await arrivalTestDatabase();
  await migrate(handle);
  await seed(handle.exec);
  const api = composeFollowUp({ db: handle.db, uploadDir, timeZone: 'Asia/Shanghai', clock: new FixedClock('2026-11-19T01:00:00.000Z') });
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => registerFollowUpRoutes({ app: server, api, attachmentMaxBytes: followUpAttachmentMaxBytes() }),
  });
  try {
    const cookie = await loginAs(app, 'buyer');
    const reviewer = await loginAs(app, 'reviewer');
    const post = (url: string, { payload, as = cookie }: { readonly payload: Record<string, unknown>; readonly as?: string }) => app.inject({ method: 'POST', url, headers: { cookie: as }, payload });
    const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } });
    const itemCode = `CG08-TEST-${randomUUID()}`;
    async function createBatch({ po, code, barcode, plannedQty = 60, warehouseId = warehouse, plannedUnit = '件' }: { po: string; code?: string; barcode?: string; plannedQty?: number; warehouseId?: string; plannedUnit?: string | null }) {
      const line = await post('/api/v1/lines', { payload: { lane: 'finished', poRaw: po, nameRaw: '脱敏精研水', itemCodeRaw: code, barcodeRaw: barcode, qtyOrdered: plannedQty, ...(plannedUnit === null ? {} : { unit: plannedUnit }), receiverPartyId: warehouseId } });
      expect(line.statusCode, line.body).toBe(200);
      const lineId = line.json().line.id;
      const batch = await post(`/api/v1/lines/${lineId}/batches`, { payload: { plannedQty, receiverPartyId: warehouseId, dateBuyerConfirmed: day } });
      expect(batch.statusCode, batch.body).toBe(200);
      return { lineId, batchId: batch.json().id, po };
    }
    const first = await createBatch({ po: firstPo, code: itemCode });
    const second = await createBatch({ po: secondPo, code: '\t', barcode: ' ' + itemCode + '\u00a0' });
    const suffix = await createBatch({ po: secondPo, code: `${itemCode}-2`, barcode: itemCode });
    const differentWarehouse = await createBatch({ po: secondPo, code: itemCode, warehouseId: 'test-other-warehouse' });
    const patchBatch = (batchId: string, payload: Record<string, unknown>) => app.inject({ method: 'PATCH', url: `/api/v1/batches/${batchId}`, headers: { cookie }, payload });
    const details = async (line: typeof first) => (await get(`/api/v1/lines/${line.lineId}`)).json().batches[0];
    const readQty = async () => Promise.all([first, second].map(async (line) => (await details(line)).fulfillment.verifiedReceivedQty));
    const source = { kind: 'ledger', source: '脱敏采购台账', number: itemCode, row: '成品提货明细 / C230 / 车次1' };
    const observation = { source, warehouseId: warehouse, receivedOn: day, itemCode, qty: 9, unit: '托' };
    const registered = await Promise.all([post(base, { payload: observation }), post(base, { payload: observation })]);
    expect(registered.map((response) => response.statusCode)).toEqual([200, 200]);
    const arrival = registered[0]?.json();
    expect(registered[1]?.json().id).toBe(arrival.id);
    expect((await get(base)).json().items.filter((item: { id: string }) => item.id === arrival.id)).toHaveLength(1);
    expect((await post(base, { payload: { ...observation, qty: 10 } })).statusCode).toBe(409);
    const detail = await get(`${base}/${arrival.id}`);
    expect(detail.statusCode, detail.body).toBe(200);
    expect(detail.json().candidates.map((row: { lineId: string }) => row.lineId)).toEqual([first.lineId, second.lineId]);
    expect(await readQty()).toEqual([0, 0]);

    const allocationFor = (target: typeof first, qty: number) => ({ batchId: target.batchId, poNumber: target.po, poLine: '明细001', evidence: '脱敏确认附件指向本要货批次', qty, category: 'finished' });
    const count = { document: { kind: 'document', source: '脱敏仓库点收', number: itemCode, row: '001' }, qty: 100, unit: '件', conversionEvidence: '脱敏仓库实点 100 件，见点收单附件' };
    const valid = { kind: 'allocate', expectedRevision: 0, reason: null, count, allocations: [allocationFor(first, 60), allocationFor(second, 40)] };
    const revise = (body: Record<string, unknown>) => post(`${base}/${arrival.id}/revise`, { payload: body });
    expect((await post(`${base}/${arrival.id}/revise`, { payload: valid, as: reviewer })).statusCode).toBe(403);
    expect((await revise({ ...valid, count: { ...count, conversionEvidence: null } })).statusCode).toBe(400);
    expect((await revise({ ...valid, allocations: [allocationFor(first, 100), allocationFor(second, 40)] })).statusCode).toBe(400);
    expect((await revise({ ...valid, allocations: [allocationFor(first, 60), allocationFor(suffix, 40)] })).statusCode).toBe(400);
    expect((await revise({ ...valid, allocations: [allocationFor(first, 60), allocationFor(differentWarehouse, 40)] })).statusCode).toBe(400);
    expect((await revise({ ...valid, allocations: [allocationFor(first, 60), { ...allocationFor(second, 40), poNumber: firstPo }] })).statusCode).toBe(400);
    expect(await readQty()).toEqual([0, 0]);
    expect((await get(`${base}/${arrival.id}`)).json().arrival.revision).toBe(0);

    const confirmations = await Promise.all([revise(valid), revise({ ...valid, allocations: [...valid.allocations].reverse() })]);
    expect(confirmations.map((response) => response.statusCode), confirmations[0]?.body).toEqual([200, 200]);
    const confirmed = confirmations[0]?.json();
    expect(confirmations[1]?.json().allocation.rows).toEqual(confirmed.allocation.rows);
    expect(await readQty()).toEqual([60, 40]);
    expect((await details(first)).status).toBe('received');
    expect((await details(second)).status).toBe('partially_received');
    const receiverPatch = await patchBatch(first.batchId, { receiverPartyId: 'test-other-warehouse' });
    expect(receiverPatch.statusCode).toBe(409);
    expect.soft((await patchBatch(first.batchId, { dateBuyerConfirmed: null, reason: '签收单仍有效' })).statusCode).toBe(409);
    expect.soft((await patchBatch(first.batchId, { dateBuyerConfirmed: '2026-11-20' })).statusCode).toBe(400);
    const movedDate = await patchBatch(first.batchId, { dateBuyerConfirmed: '2026-11-20', reason: '补录采购实际确认日期' });
    expect.soft(movedDate.statusCode, movedDate.body).toBe(200);
    expect.soft(await details(first)).toMatchObject({ receiverPartyId: warehouse, dateBuyerConfirmed: '2026-11-20', fulfillment: { verifiedReceivedQty: 60 } });
    expect((await details(first)).receipts[0].fulfillment.arrival).toEqual({ arrivalId: arrival.id, revision: 1 });
    expect((await get(base)).json().items.some((item: { id: string }) => item.id === arrival.id)).toBe(false);
    const linkedReceipt = confirmed.allocation.rows.find((row: { batchId: string }) => row.batchId === first.batchId).receiptId;
    expect((await post(`/api/v1/receipts/${linkedReceipt}/void`, { payload: { reason: '整份更正' } })).statusCode).toBe(409);
    expect((await app.inject({ method: 'DELETE', url: `/api/v1/receipts/${linkedReceipt}`, headers: { cookie } })).statusCode).toBe(409);

    const alias = await post(base, { payload: { ...observation, source: { ...source, row: '不同台账位序' } } });
    expect(alias.statusCode).toBe(200);
    expect((await post(`${base}/${alias.json().id}/revise`, { payload: valid })).statusCode).toBe(409);
    const replacementCount = { ...count, document: { ...count.document, row: '复点更正单行' } };
    const correction = { ...valid, count: replacementCount, expectedRevision: 1, reason: '回读逐行点收明细后修正', allocations: [allocationFor(first, 45), allocationFor(second, 55)] };
    expect((await revise({ ...correction, allocations: [allocationFor(first, 45), allocationFor(suffix, 55)] })).statusCode).toBe(400);
    expect(await readQty()).toEqual([60, 40]);
    const corrected = await revise(correction);
    expect(corrected.statusCode, corrected.body).toBe(200);
    expect(await readQty()).toEqual([45, 55]);
    expect((await details(first)).receipts.find((row: { id: string }) => row.id === linkedReceipt).voidReason).toBe(correction.reason);
    expect((await revise(valid)).json().revision).toBe(2);
    expect((await revise({ ...valid, reason: '不同的重试请求' })).statusCode).toBe(409);
    const aliasUrl = `${base}/${alias.json().id}/revise`;
    const aliasAllocation = await post(aliasUrl, { payload: valid });
    expect(aliasAllocation.statusCode, aliasAllocation.body).toBe(200);
    expect((await post(aliasUrl, { payload: { kind: 'rollback', expectedRevision: 1, reason: '原点收单错绑，复核后再登记' } })).statusCode).toBe(200);
    const aliasRevision = 2;
    expect((await post(aliasUrl, { payload: { ...valid, count: replacementCount, expectedRevision: aliasRevision } })).statusCode).toBe(409);
    const rollback = { kind: 'rollback', expectedRevision: 2, reason: '仓库要求重新核对' };
    expect((await revise(rollback)).json()).toMatchObject({ revision: 3, allocation: null });
    expect((await revise(rollback)).json()).toMatchObject({ revision: 3, allocation: null });
    expect(await readQty()).toEqual([0, 0]);
    expect((await get(`${base}/${arrival.id}`)).json().arrival).toMatchObject({ revision: 3, allocation: null, qty: 9, unit: '托' });
    expect((await post(base, { payload: observation })).json().id).toBe(arrival.id);
    const contender = await post(base, { payload: { ...observation, source: { ...source, row: '第三份独立台账位序' } } });
    expect(contender.statusCode).toBe(200);
    const reallocate = { ...valid, count: replacementCount };
    const competing = await Promise.all([
      post(aliasUrl, { payload: { ...reallocate, expectedRevision: aliasRevision } }),
      post(`${base}/${contender.json().id}/revise`, { payload: reallocate }),
    ]);
    expect(competing.map((response) => response.statusCode).sort(), competing.map((response) => response.body).join('\n')).toEqual([200, 409]);
    expect(await readQty()).toEqual([60, 40]);
    expect((await revise(valid)).json()).toMatchObject({ revision: 3, allocation: null });
    const retry = await Promise.all([
      post(aliasUrl, { payload: { ...reallocate, expectedRevision: aliasRevision } }),
      post(`${base}/${contender.json().id}/revise`, { payload: reallocate }),
    ]);
    expect(retry.map((response) => response.statusCode)).toEqual(competing.map((response) => response.statusCode));
    expect(await readQty()).toEqual([60, 40]);
    const audited = (await auditQueries(handle.db).list({ entityId: arrival.id })).items;
    expect(audited.map((row) => row.action).sort()).toEqual(['arrival.allocate', 'arrival.correct', 'arrival.register', 'arrival.rollback']);
    expect(audited.find((row) => row.action === 'arrival.correct')).toMatchObject({
      before: { revision: 1 },
      after: { revision: 2, reason: correction.reason },
    });

    const short = await createBatch({ po: firstPo, code: `${itemCode}-SHORT`, plannedQty: 100 });
    const shipped = await post(`/api/v1/batches/${short.batchId}/shipments`, { payload: {
      qty: 100, shippedOn: day, fulfillment: { kind: 'verified', unit: '件', evidence: '脱敏交运单发出 100 件' },
    } });
    expect(shipped.statusCode, shipped.body).toBe(200);
    const registerPieces = (row: string, qty: number) => post(base, { payload: {
      ...observation, source: { ...source, row }, itemCode: `${itemCode}-SHORT`, unit: '件', qty,
    } });
    const original = await registerPieces('脱敏原报行', 100);
    expect(original.statusCode, original.body).toBe(200);
    const shortCount = { ...count, document: { ...count.document, row: '脱敏短收单据行' }, qty: 90, conversionEvidence: '脱敏签收差异单 S1 第 3 行，原报 100 件，复点有效实收 90 件' };
    const shortReceipt = { ...valid, count: shortCount, allocations: [allocationFor(short, 90)] };
    const confirmShort = (payload: Record<string, unknown>) => post(`${base}/${original.json().id}/revise`, { payload });
    expect((await confirmShort({ ...shortReceipt, count: { ...shortCount, conversionEvidence: null } })).statusCode).toBe(400);
    expect((await confirmShort({ ...shortReceipt, allocations: [allocationFor(short, 100)] })).statusCode).toBe(400);
    expect(await details(short)).toMatchObject({ status: 'shipped', fulfillment: { verifiedReceivedQty: 0, inTransitQty: 100 } });
    const acceptedShort = await confirmShort(shortReceipt);
    expect(acceptedShort.statusCode, acceptedShort.body).toBe(200);
    expect(acceptedShort.json()).toMatchObject({ qty: 100, unit: '件', allocation: { count: { qty: 90, conversionEvidence: shortCount.conversionEvidence }, rows: [{ qty: 90 }] } });
    expect(await details(short)).toMatchObject({ status: 'partially_received', fulfillment: { verifiedReceivedQty: 90, inTransitQty: 10 } });

    const makeup = await registerPieces('脱敏补发原报行', 10);
    expect(makeup.statusCode, makeup.body).toBe(200);
    const acceptedMakeup = await post(`${base}/${makeup.json().id}/revise`, { payload: {
      ...valid, count: { ...count, document: { ...count.document, row: '脱敏补发签收行' }, qty: 10, conversionEvidence: null }, allocations: [allocationFor(short, 10)],
    } });
    expect(acceptedMakeup.statusCode, acceptedMakeup.body).toBe(200);
    expect(await details(short)).toMatchObject({ status: 'received', fulfillment: { verifiedReceivedQty: 100, inTransitQty: 0 } });

    const fractionalCode = `${itemCode}-FRACTION`;
    const fractional = await createBatch({ po: firstPo, code: fractionalCode, plannedQty: 0.8 });
    for (const qty of [0.1, 0.7]) {
      const part = await post(base, { payload: {
        ...observation, source: { ...source, row: `原报 ${qty}` }, itemCode: fractionalCode, unit: '件', qty,
      } });
      expect(part.statusCode, part.body).toBe(200);
      const accepted = await post(`${base}/${part.json().id}/revise`, { payload: {
        ...valid, count: { ...count, document: { ...count.document, row: `仓库点收 ${qty}` }, qty, conversionEvidence: null },
        allocations: [allocationFor(fractional, qty)],
      } });
      expect(accepted.statusCode, accepted.body).toBe(200);
    }
    expect(await details(fractional)).toMatchObject({
      status: 'received', receivedQty: 0.8, qtyVariance: 0, fulfillment: { verifiedReceivedQty: 0.8, unshippedQty: 0 },
    });

    const missingUnitCode = `${itemCode}-MISSING-UNIT`;
    const missingUnit = await createBatch({ po: firstPo, code: missingUnitCode, plannedUnit: null });
    const pending = await post(`/api/v1/batches/${missingUnit.batchId}/shipments`, { payload: {
      qty: 5, shippedOn: day, fulfillment: { kind: 'verified', unit: '件', evidence: '原核实交运记录' },
    } });
    expect(pending.json().fulfillment.reviewReason).toBe('unit_missing');
    const changedLine = await app.inject({ method: 'PATCH', url: `/api/v1/lines/${missingUnit.lineId}`, headers: { cookie }, payload: { unit: '件' } });
    expect(changedLine.statusCode, changedLine.body).toBe(200);
    expect((await details(missingUnit)).fulfillment.unit).toBeNull();
    const inbound = await post(base, { payload: {
      ...observation, source: { ...source, row: '原始缺单位订单签收行' }, itemCode: missingUnitCode, unit: '件', qty: 60,
    } });
    const inboundUrl = `${base}/${inbound.json().id}`;
    expect((await get(inboundUrl)).json().candidates[0].batch.canAllocate).toBe(false);
    expect.soft((await patchBatch(missingUnit.batchId, { plannedUnit: '件' })).statusCode).toBe(400);
    expect.soft((await patchBatch(missingUnit.batchId, { plannedUnit: '／', reason: '仓库点收原单' })).statusCode).toBe(400);
    expect.soft((await patchBatch(missingUnit.batchId, { plannedUnit: '件', reason: '—' })).statusCode).toBe(400);
    const reason = '采购原单确认 60 件';
    const completedUnit = await patchBatch(missingUnit.batchId, { plannedUnit: '件', reason });
    expect.soft(completedUnit.statusCode, completedUnit.body).toBe(200);
    expect.soft((await patchBatch(missingUnit.batchId, { plannedUnit: '托', reason })).statusCode).toBe(409);
    expect.soft((await get(inboundUrl)).json().candidates[0].batch.canAllocate).toBe(true);
    const allocatedUnit = await post(`${inboundUrl}/revise`, { payload: {
      ...valid, count: { ...count, document: { ...count.document, row: '补记单位后确认的点收单行' }, qty: 60, conversionEvidence: null },
      allocations: [allocationFor(missingUnit, 60)],
    } });
    expect.soft(allocatedUnit.statusCode, allocatedUnit.body).toBe(200);
    expect.soft(await details(missingUnit)).toMatchObject({ fulfillment: { unit: '件', verifiedShippedQty: 0, verifiedReceivedQty: 60, reviewCount: 1 } });
    const unitAudit = await auditQueries(handle.db).list({ entityId: missingUnit.batchId });
    expect.soft(unitAudit.items).toEqual(expect.arrayContaining([expect.objectContaining({
      action: 'batch.update', after: expect.objectContaining({ plannedUnit: '件', reason }),
    })]));

    const duplicateCode = `${itemCode}-SAME-PO`;
    const duplicateFirst = await createBatch({ po: firstPo, code: duplicateCode });
    const duplicateSecond = await createBatch({ po: firstPo, code: duplicateCode });
    const snapshot = `cg08-same-po-snapshot-${duplicateFirst.lineId}`;
    const snapshotRow = `cg08-source-row-${duplicateFirst.lineId}`;
    await handle.exec(`
      INSERT INTO import_rows (id, import_batch_id, sheet_name, row_no, raw, parsed, issues, action)
      VALUES ('${snapshotRow}', 'cg08-source-batch', '成品提货明细', 230, '{}', '{}', '[]', 'create');
      INSERT INTO order_line_snapshots (id, order_line_id, import_batch_id, import_row_id, data)
      VALUES ('${snapshot}', '${duplicateFirst.lineId}', 'cg08-source-batch', '${snapshotRow}', '{}');
      UPDATE order_lines SET current_snapshot_id = '${snapshot}' WHERE id = '${duplicateFirst.lineId}';
    `);
    const duplicateObservation = await post(base, { payload: {
      ...observation, source: { ...source, row: '同 PO 同码的签收行' }, itemCode: duplicateCode, unit: '件', qty: 60,
    } });
    const duplicateUrl = `${base}/${duplicateObservation.json().id}`;
    const duplicateCandidates = (await get(duplicateUrl)).json().candidates;
    expect.soft(duplicateCandidates).toEqual([
      expect.objectContaining({ lineId: duplicateFirst.lineId, needsLineConfirmation: true, source: { importBatchId: 'cg08-source-batch', sheet: '成品提货明细', rowNo: 230 } }),
      expect.objectContaining({ lineId: duplicateSecond.lineId, needsLineConfirmation: true, source: null }),
    ]);
    const duplicatePayload = {
      ...valid, count: { ...count, document: { ...count.document, row: '同 PO 同码的点收单行' }, qty: 60, conversionEvidence: null },
      allocations: [allocationFor(duplicateSecond, 60)],
    };
    const withoutProof = await post(`${duplicateUrl}/revise`, { payload: duplicatePayload });
    expect(withoutProof.statusCode).toBe(400);
    const crossed = { ...duplicatePayload, allocations: [{ ...allocationFor(duplicateSecond, 60), targetLineId: duplicateFirst.lineId }] };
    expect((await post(`${duplicateUrl}/revise`, { payload: crossed })).statusCode).toBe(400);
    expect((await get(duplicateUrl)).json().arrival.allocation).toBeNull();
    const checked = { ...duplicatePayload, allocations: [{ ...allocationFor(duplicateFirst, 60), targetLineId: duplicateFirst.lineId }] };
    const applied = await post(`${duplicateUrl}/revise`, { payload: checked });
    expect(applied.statusCode, applied.body).toBe(200);
    expect((await post(`${duplicateUrl}/revise`, { payload: checked })).json()).toMatchObject({ revision: 1 });
    expect((await post(`${duplicateUrl}/revise`, { payload: { ...checked, allocations: [{ ...checked.allocations[0], targetLineId: duplicateSecond.lineId }] } })).statusCode).toBe(409);
    expect(applied.json().allocation.rows[0]).toMatchObject({ lineId: duplicateFirst.lineId, targetLineId: duplicateFirst.lineId, poLine: '明细001' });
    expect((await details(duplicateFirst)).fulfillment.verifiedReceivedQty).toBe(60);
    expect((await details(duplicateSecond)).fulfillment.verifiedReceivedQty).toBe(0);
  } finally {
    await app.close();
    await handle.close();
    await rm(uploadDir, { recursive: true });
  }
});
