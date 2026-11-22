import { entityId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import type { ImportBatch, ImportRow } from '../../packages/domain/src/index.js';
import { makeCommitImport } from '../../packages/application/src/imports/index.js';
import './load-import-registry.js';
import { aUser, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';

const at = '2026-10-12T00:00:00.000Z';

function cell<T>(value: T) {
  return { raw: value === null ? null : String(value), value };
}

function batch(id: string, factoryPartyId: ImportBatch['factoryPartyId'] = null): ImportBatch {
  return {
    id: entityId(id), createdAt: at, updatedAt: at, fileId: entityId('file-1'), template: 'po-master-v1', factoryPartyId,
    status: 'parsed', coverage: 'full_snapshot', fileMeta: null, stats: null,
    decisions: { issueDecisions: {}, rowSkips: [], conflictResolutions: [] }, createdBy: entityId('buyer-1'),
    committedBy: null, committedAt: null, rolledBackBy: null, rolledBackAt: null, error: null,
  };
}

function poRow(id: string, batchId: string): ImportRow {
  return {
    id: entityId(id), importBatchId: entityId(batchId), sheetName: '总表', rowNo: 2, raw: {},
    parsed: {
      oaDemandRef: cell(null), supplierRaw: cell('宜侬'), nameRaw: cell('海葡萄'), barcodeRaw: cell('2000000003023'), qtyOrdered: cell(10),
      oaSubmittedOn: cell(null), oaRequiredOn: cell(null), plannedDurationDays: cell(null),
      po: cell({ poRaw: 'PO1', poNorm: 'PO1', poFormat: 'OTHER', relatedPoRaws: [] }), actualStartOn: cell(null), firstDeliveryOn: cell(null), actualEndOn: cell(null),
      actualDurationDays: cell(null), factoryStockReported: cell(null), shippedQtyReported: cell(null), qtyDiffReported: cell(null), statusReported: cell('进行中'),
    },
    issues: [], action: 'create', targetId: null, skipReason: null,
  };
}

function namedRow(input: { readonly id: string; readonly batchId: string; readonly po: string; readonly name: string }): ImportRow {
  const row = poRow(input.id, input.batchId);
  if (typeof row.parsed !== 'object' || row.parsed === null || Array.isArray(row.parsed)) return row;
  return { ...row, parsed: { ...row.parsed, po: cell({ poRaw: input.po, poNorm: input.po, poFormat: 'OTHER', relatedPoRaws: [] }), nameRaw: cell(input.name) } };
}

function deps(memory: ReturnType<typeof createMemory>) {
  return { uow: memory.unitOfWork, clock: new FixedClock(at), ids: new SequentialIds() };
}

function buyer() {
  return aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
}

it('不同工厂来源的全量导入不会互相标记缺失', async () => {
  const memory = createMemory();
  const commit = makeCommitImport(deps(memory));
  await memory.stores.imports.save(batch('source-a-1', entityId('factory-a')));
  await memory.stores.imports.saveRow(namedRow({ id: 'source-a-r1', batchId: 'source-a-1', po: 'PO-A', name: 'A品' }));
  await commit({ importBatchId: 'source-a-1' }, buyer());
  await memory.stores.imports.save(batch('source-b-1', entityId('factory-b')));
  await memory.stores.imports.saveRow(namedRow({ id: 'source-b-r1', batchId: 'source-b-1', po: 'PO-B', name: 'B品' }));
  await commit({ importBatchId: 'source-b-1' }, buyer());
  await memory.stores.imports.save(batch('source-a-2', entityId('factory-a')));
  await memory.stores.imports.saveRow({ ...namedRow({ id: 'source-a-r2', batchId: 'source-a-2', po: 'PO-A', name: 'A品' }), action: 'unchanged' });
  await commit({ importBatchId: 'source-a-2' }, buyer());

  expect((await memory.stores.orderLines.find('source-a-r1:line'))?.latestImportPresence).toBe('present');
  expect((await memory.stores.orderLines.find('source-b-r1:line'))?.latestImportPresence).toBe('not_applicable');
  expect((await memory.stores.orderLines.find('source-b-r1:line'))?.missingInLatestImport).toBe(false);
});

it('全量导入中被人工跳过的既有行仍算作已出现', async () => {
  const memory = createMemory();
  const commit = makeCommitImport(deps(memory));
  await memory.stores.imports.save(batch('skip-source-1'));
  await memory.stores.imports.saveRow(poRow('skip-source-r1', 'skip-source-1'));
  await commit({ importBatchId: 'skip-source-1' }, buyer());
  await memory.stores.imports.save(batch('skip-source-2'));
  await memory.stores.imports.saveRow({ ...poRow('skip-source-r2', 'skip-source-2'), action: 'skip', skipReason: '人工跳过' });
  await commit({ importBatchId: 'skip-source-2' }, buyer());

  expect((await memory.stores.orderLines.find('skip-source-r1:line'))?.latestImportPresence).toBe('present');
  expect((await memory.stores.orderLines.find('skip-source-r1:line'))?.missingInLatestImport).toBe(false);
});
