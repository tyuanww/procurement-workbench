import { entityId, orderLineId } from '../../packages/domain/src/index.js';
import type { ImportBatch, ImportRow } from '../../packages/domain/src/index.js';
import { makeCommitImport, makeSaveImportDecisions } from '../../packages/application/src/imports/index.js';
import './load-import-registry.js';
import { aUser, anOrderLine, aPurchaseOrder, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import { expect, it } from 'vitest';

const at = '2026-10-12T00:00:00.000Z';

it('保存冲突决策后，选择已有订单行或新建都能解除冲突并提交', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('b1'));
  await memory.stores.purchaseOrders.save(aPurchaseOrder({ id: entityId('po-1'), poRaw: 'PO1', poNorm: 'PO1' }));
  await memory.stores.orderLines.save(anOrderLine({ id: orderLineId('line-1'), purchaseOrderId: entityId('po-1'), candidateKey: 'PO1|2000000003023' }));
  await memory.stores.imports.saveRow({ ...poRow('r1', 'b1'), action: 'conflict' });
  await memory.stores.imports.saveRow({ ...poRow('r2', 'b1'), action: 'conflict', rowNo: 3 });
  const deps = { uow: memory.unitOfWork, clock: new FixedClock(at), ids: new SequentialIds() };
  await makeSaveImportDecisions(deps)({ importBatchId: 'b1', decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [{ rowId: 'r1', targetOrderLineId: 'line-1' }, { rowId: 'r2', targetOrderLineId: null }] } }, aUser({ id: entityId('buyer-1'), roles: ['buyer'] }));
  const decided = await memory.stores.imports.listRows('b1');
  expect(decided.find((row) => row.id === 'r1')).toMatchObject({ action: 'update', targetId: 'line-1' });
  expect(decided.find((row) => row.id === 'r2')).toMatchObject({ action: 'create', targetId: null });
  await makeCommitImport(deps)({ importBatchId: 'b1' }, aUser({ id: entityId('buyer-1'), roles: ['buyer'] }));
  expect((await memory.stores.imports.listRows('b1')).map((row) => row.action)).toEqual(['update', 'create']);
  expect((await memory.stores.orderLines.find('line-1'))?.qtyOrdered).toBe(10);
  expect(await memory.stores.orderLines.find('r2:line')).toBeDefined();
});

function batch(id: string): ImportBatch {
  return { id: entityId(id), createdAt: at, updatedAt: at, fileId: entityId('file-1'), template: 'po-master-v1', factoryPartyId: null, status: 'parsed', fileMeta: null, stats: null, decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] }, createdBy: entityId('buyer-1'), committedBy: null, committedAt: null, rolledBackBy: null, rolledBackAt: null, error: null };
}

function poRow(id: string, batchId: string): ImportRow {
  const cell = <T>(value: T) => ({ raw: value === null ? null : String(value), value });
  return { id: entityId(id), importBatchId: entityId(batchId), sheetName: '总表', rowNo: 2, raw: {}, parsed: { oaDemandRef: cell(null), supplierRaw: cell('甲代工厂'), nameRaw: cell('海葡萄'), barcodeRaw: cell('2000000003023'), qtyOrdered: cell(10), oaSubmittedOn: cell(null), oaRequiredOn: cell(null), plannedDurationDays: cell(null), po: cell({ poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER', relatedPoRaws: [] }), actualStartOn: cell(null), firstDeliveryOn: cell(null), actualEndOn: cell(null), actualDurationDays: cell(null), factoryStockReported: cell(null), shippedQtyReported: cell(null), qtyDiffReported: cell(null), statusReported: cell('进行中') }, issues: [], action: 'create', targetId: null, skipReason: null };
}
