import { entityId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import type { ImportBatch, ImportRow } from '../../packages/domain/src/index.js';
import { makeCommitImport, makeSaveImportDecisions } from '../../packages/application/src/imports/index.js';
import './load-import-registry.js';
import { aUser, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';

const at = '2026-10-12T00:00:00.000Z';

it('冲突分页逐页保存后两页解决都保留，并可提交', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('b1'));
  await memory.stores.imports.saveRow({ ...poRow('r1', 'b1'), action: 'conflict' });
  await memory.stores.imports.saveRow({ ...poRow('r2', 'b1'), action: 'conflict', rowNo: 3 });
  const save = makeSaveImportDecisions(deps(memory));
  await save({ importBatchId: 'b1', decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [{ rowId: 'r1', targetOrderLineId: null }] } }, buyer());
  await save({ importBatchId: 'b1', decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [{ rowId: 'r2', targetOrderLineId: null }] } }, buyer());
  const saved = await memory.stores.imports.get('b1');
  expect(saved.decisions).toMatchObject({
    conflictResolutions: [
      { rowId: 'r1', targetOrderLineId: null },
      { rowId: 'r2', targetOrderLineId: null },
    ],
  });
  const rows = await memory.stores.imports.listRows('b1');
  expect(rows.map((row) => row.action)).toEqual(['create', 'create']);
  await makeCommitImport(deps(memory))({ importBatchId: 'b1' }, buyer());
  expect(await memory.stores.orderLines.find('r1:line')).toBeDefined();
  expect(await memory.stores.orderLines.find('r2:line')).toBeDefined();
});

it('按文件年份补年提交空数组时，不清掉已保存的跳过和冲突解决', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('b1'));
  await memory.stores.imports.saveRow({ ...poRow('r1', 'b1'), action: 'conflict' });
  await memory.stores.imports.saveRow({ ...poRow('r2', 'b1'), rowNo: 3 });
  const save = makeSaveImportDecisions(deps(memory));
  await save({ importBatchId: 'b1', decisions: { issueDecisions: {}, rowSkips: [{ rowId: 'r2', reason: '人工跳过' }], conflictResolutions: [{ rowId: 'r1', targetOrderLineId: null }] } }, buyer());
  await save({ importBatchId: 'b1', decisions: { issueDecisions: { DATE_NO_YEAR: 'fill_file_year' }, rowSkips: [], conflictResolutions: [] } }, buyer());
  const saved = await memory.stores.imports.get('b1');
  expect(saved.decisions).toMatchObject({
    issueDecisions: { DATE_NO_YEAR: 'fill_file_year' },
    rowSkips: [{ rowId: 'r2', reason: '人工跳过' }],
    conflictResolutions: [{ rowId: 'r1', targetOrderLineId: null }],
  });
  const rows = await memory.stores.imports.listRows('b1');
  expect(rows.find((row) => row.id === 'r1')).toMatchObject({ action: 'create', skipReason: null });
  expect(rows.find((row) => row.id === 'r2')).toMatchObject({ action: 'skip', skipReason: '人工跳过' });
});

it('服务端按 rowId 合并决定：同 rowId 以本次输入为准，其它 rowId 保留', async () => {
  const memory = createMemory();
  await memory.stores.imports.save(batch('b1'));
  await memory.stores.imports.saveRow({ ...poRow('r1', 'b1'), action: 'conflict' });
  await memory.stores.imports.saveRow({ ...poRow('r2', 'b1'), action: 'conflict', rowNo: 3 });
  const save = makeSaveImportDecisions(deps(memory));
  await save({ importBatchId: 'b1', decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [{ rowId: 'r1', targetOrderLineId: 'line-1' }, { rowId: 'r2', targetOrderLineId: null }] } }, buyer());
  await save({ importBatchId: 'b1', decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [{ rowId: 'r1', targetOrderLineId: 'line-2' }] } }, buyer());
  const saved = await memory.stores.imports.get('b1');
  expect(saved.decisions).toMatchObject({
    conflictResolutions: [
      { rowId: 'r1', targetOrderLineId: 'line-2' },
      { rowId: 'r2', targetOrderLineId: null },
    ],
  });
  const rows = await memory.stores.imports.listRows('b1');
  expect(rows.find((row) => row.id === 'r1')).toMatchObject({ action: 'update', targetId: 'line-2' });
  expect(rows.find((row) => row.id === 'r2')).toMatchObject({ action: 'create', targetId: null });
});

function batch(id: string): ImportBatch {
  return { id: entityId(id), createdAt: at, updatedAt: at, fileId: entityId('file-1'), template: 'po-master-v1', factoryPartyId: null, status: 'parsed', fileMeta: null, stats: null, decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] }, createdBy: entityId('buyer-1'), committedBy: null, committedAt: null, rolledBackBy: null, rolledBackAt: null, error: null };
}

function poRow(id: string, batchId: string): ImportRow {
  const cell = <T>(value: T) => ({ raw: value === null ? null : String(value), value });
  return { id: entityId(id), importBatchId: entityId(batchId), sheetName: '总表', rowNo: 2, raw: {}, parsed: { oaDemandRef: cell(null), supplierRaw: cell('宜侬'), nameRaw: cell('海葡萄'), barcodeRaw: cell('2000000003023'), qtyOrdered: cell(10), oaSubmittedOn: cell(null), oaRequiredOn: cell(null), plannedDurationDays: cell(null), po: cell({ poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER', relatedPoRaws: [] }), actualStartOn: cell(null), firstDeliveryOn: cell(null), actualEndOn: cell(null), actualDurationDays: cell(null), factoryStockReported: cell(null), shippedQtyReported: cell(null), qtyDiffReported: cell(null), statusReported: cell('进行中') }, issues: [], action: 'create', targetId: null, skipReason: null };
}

function buyer() {
  return aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
}

function deps(memory: ReturnType<typeof createMemory>) {
  return { uow: memory.unitOfWork, clock: new FixedClock(at), ids: new SequentialIds() };
}
