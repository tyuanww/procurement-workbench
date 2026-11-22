import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, it } from 'vitest';
import { entityId } from '../../packages/domain/src/index.js';
import { makeCommitImport, makeStartImport } from '../../packages/application/src/imports/index.js';
import { templates } from '../../packages/importers/src/registry.js';
import { workbookReader } from '../../packages/importers/src/workbook/index.js';
import { aUser, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import './load-import-registry.js';

const at = '2026-11-10T00:00:00.000Z';
const root = path.resolve(import.meta.dirname, '../..');

it('排产作业表再次正式启动时，已提交的行是不变', async () => {
  const memory = createMemory();
  const bytes = plannerCsv('PO20260101000001', '1000');
  const stored = await memory.files.put({ bytes, originalName: 'planner.csv', mime: 'text/csv' });
  const start = makeStartImport({ uow: memory.unitOfWork, clock: new FixedClock(at), ids: new SequentialIds(), files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock: new FixedClock(at) });
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const first = await start({ fileId: entityId(stored.sha256), template: 'planner-sheet-v1' }, actor);
  await commit({ importBatchId: first.importBatchId }, actor);
  const second = await start({ fileId: entityId(stored.sha256), template: 'planner-sheet-v1' }, actor);
  const rows = await memory.stores.imports.listRows(second.importBatchId);
  const live = rows.filter((row) => row.action !== 'skip');
  expect(live.map((row) => row.action)).toEqual(['unchanged']);
});

it('改过单元格的行再次启动是新建，没改的行是不变', async () => {
  const memory = createMemory();
  const firstBytes = csvBytes([
    ['排产日期', '订单号', '品名', '下单品号', '要求排产', '包材组合', '生产品号', '采购单号', '备注'],
    ['2026-06-09', 'PO20260101000001', '面膜', '70000001', '1000', '组合', '70000002', '/', ''],
    ['2026-06-09', 'PO20260101000002', '精华', '70000003', '1000', '组合', '70000004', '/', ''],
  ]);
  const secondBytes = csvBytes([
    ['排产日期', '订单号', '品名', '下单品号', '要求排产', '包材组合', '生产品号', '采购单号', '备注'],
    ['2026-06-09', 'PO20260101000001', '面膜', '70000001', '1000', '组合', '70000002', '/', ''],
    ['2026-06-09', 'PO20260101000002', '精华', '70000003', '2000', '组合', '70000004', '/', ''],
  ]);
  const started = await restart({ memory, firstBytes, secondBytes });
  const rows = await memory.stores.imports.listRows(started.second.importBatchId);
  expect(rows.find((row) => row.rowNo === 2)?.action).toBe('unchanged');
  expect(rows.find((row) => row.rowNo === 3)?.action).toBe('create');
});

function plannerCsv(po: string, qty: string): Uint8Array {
  return csvBytes([
    ['排产日期', '订单号', '品名', '下单品号', '要求排产', '包材组合', '生产品号', '采购单号', '备注'],
    ['2026-06-09', po, '面膜', '70000001', qty, '组合', '70000002', '/', ''],
  ]);
}

function csvBytes(lines: readonly (readonly string[])[]): Uint8Array {
  return new TextEncoder().encode(lines.map((line) => line.join(',')).join('\n'));
}

async function restart(input: { readonly memory: ReturnType<typeof createMemory>; readonly firstBytes: Uint8Array; readonly secondBytes: Uint8Array }) {
  const memory = input.memory;
  const start = makeStartImport({ uow: memory.unitOfWork, clock: new FixedClock(at), ids: new SequentialIds(), files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock: new FixedClock(at) });
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const firstFile = await memory.files.put({ bytes: input.firstBytes, originalName: 'planner-a.csv', mime: 'text/csv' });
  const secondFile = await memory.files.put({ bytes: input.secondBytes, originalName: 'planner-b.csv', mime: 'text/csv' });
  const first = await start({ fileId: entityId(firstFile.sha256), template: 'planner-sheet-v1' }, actor);
  await commit({ importBatchId: first.importBatchId }, actor);
  const second = await start({ fileId: entityId(secondFile.sha256), template: 'planner-sheet-v1' }, actor);
  return { second };
}

it('另一张表的新订单不会因为都叫 upload.csv 被标成不变', async () => {
  const memory = createMemory();
  const started = await restart({
    memory,
    firstBytes: plannerCsv('PO20260101000001', '1000'),
    secondBytes: plannerCsv('PO20260101000099', '1000'),
  });
  const rows = await memory.stores.imports.listRows(started.second.importBatchId);
  expect(rows.find((row) => row.rowNo === 2)?.action).toBe('create');
});

it('启动不再按模板 id 分支', () => {
  const source = readFileSync(path.join(root, 'packages/application/src/imports/use-cases/start-import.ts'), 'utf8');
  expect(source.includes("'factory-progress-v1'")).toBe(false);
  expect(source.includes("'product-archive-v1'")).toBe(false);
  expect(source.includes("'planner-sheet-v1'")).toBe(false);
});
