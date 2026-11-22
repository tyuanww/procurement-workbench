import { entityId, orderLineId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { makeCommitImport, makeStartImport } from '../../packages/application/src/imports/index.js';
import { REQUIRED_COLUMNS } from '../../packages/importers/src/templates/po-master-v1/columns.js';
import { templates } from '../../packages/importers/src/registry.js';
import { workbookReader } from '../../packages/importers/src/workbook/index.js';
import { anOrderLine, aUser, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import './load-import-registry.js';

const at = '2026-10-12T00:00:00.000Z';

const filled: Readonly<Record<string, string>> = {
  供应商: '宜侬',
  产品名称: '海葡萄水光冰冰贴',
  产品条码: '2000000003023',
  采购订单号: 'PO-2026-1',
  状态: '进行中',
};

it('条件更新不能把另一行改成已占用的候选键', async () => {
  const memory = createMemory();
  const owner = anOrderLine({ id: orderLineId('owner'), candidateKey: 'PO|已占用' });
  const other = anOrderLine({ id: orderLineId('other'), candidateKey: null });
  await memory.stores.orderLines.save(owner);
  await memory.stores.orderLines.save(other);
  const saveConditional = memory.stores.orderLines.saveConditional;
  if (saveConditional === undefined) throw new Error('内存仓储没有条件更新');
  await expect(saveConditional({ ...other, candidateKey: 'PO|已占用' }, other.updatedAt)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  expect((await memory.stores.orderLines.find('other'))?.candidateKey).toBeNull();
  expect(await saveConditional({ ...owner, qtyOrdered: 11 }, owner.updatedAt)).toBe(true);
});

it('没有候选键的订单行可以并存', async () => {
  const memory = createMemory();
  await memory.stores.orderLines.save(anOrderLine({ id: orderLineId('blank-1'), candidateKey: null }));
  await memory.stores.orderLines.save(anOrderLine({ id: orderLineId('blank-2'), candidateKey: null }));
  expect(await memory.stores.orderLines.listAll?.()).toHaveLength(2);
});

it('两批同时提交时，先完成的留下一行，后完成的整批失败', async () => {
  const memory = createMemory();
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const clock = new FixedClock(at);
  const ids = new SequentialIds();
  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids, files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock });
  const older = await upload({ memory, bytes: csv(10), originalName: 'po-overlap-10.csv' });
  const newer = await upload({ memory, bytes: csv(20), originalName: 'po-overlap-20.csv' });
  const first = await start({ fileId: entityId(older.sha256), template: 'po-master-v1' }, actor);
  const second = await start({ fileId: entityId(newer.sha256), template: 'po-master-v1' }, actor);
  const settled = await Promise.allSettled([
    commit({ importBatchId: first.importBatchId }, actor),
    commit({ importBatchId: second.importBatchId }, actor),
  ]);
  const rejected = settled.filter((item) => item.status === 'rejected');
  expect(rejected).toHaveLength(1);
  expect(rejected[0]?.reason).toMatchObject({ code: 'STATE_CONFLICT' });
  const lines = await memory.stores.orderLines.listAll?.() ?? [];
  expect(lines).toHaveLength(1);
  expect(lines[0]?.qtyOrdered).toBe(10);
  expect((await memory.stores.imports.get(first.importBatchId)).status).toBe('committed');
  expect((await memory.stores.imports.get(second.importBatchId)).status).toBe('parsed');
});

it('两批都在提交前启动时，后提交的同候选键整批失败且只留一行', async () => {
  const memory = createMemory();
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const clock = new FixedClock(at);
  const ids = new SequentialIds();
  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids, files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock });
  const older = await upload({ memory, bytes: csv(10), originalName: 'po-race-10.csv' });
  const newer = await upload({ memory, bytes: csv(20), originalName: 'po-race-20.csv' });
  const first = await start({ fileId: entityId(older.sha256), template: 'po-master-v1' }, actor);
  const second = await start({ fileId: entityId(newer.sha256), template: 'po-master-v1' }, actor);
  await commit({ importBatchId: first.importBatchId }, actor);
  await expect(commit({ importBatchId: second.importBatchId }, actor)).rejects.toMatchObject({ code: 'STATE_CONFLICT' });
  const lines = await memory.stores.orderLines.listAll?.() ?? [];
  expect(lines).toHaveLength(1);
  expect(lines[0]?.qtyOrdered).toBe(10);
  expect((await memory.stores.imports.get(second.importBatchId)).status).toBe('parsed');
  expect((await memory.stores.imports.get(first.importBatchId)).status).toBe('committed');
});

it('采购总表数量变了再提交，订单行是新数量，行仍是更新', async () => {
  const memory = createMemory();
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const clock = new FixedClock(at);
  const ids = new SequentialIds();
  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids, files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock });
  const first = await upload({ memory, bytes: csv(10), originalName: 'po-10.csv' });
  const started = await start({ fileId: entityId(first.sha256), template: 'po-master-v1' }, actor);
  await commit({ importBatchId: started.importBatchId }, actor);
  const second = await upload({ memory, bytes: csv(20), originalName: 'po-20.csv' });
  const again = await start({ fileId: entityId(second.sha256), template: 'po-master-v1' }, actor);
  const compared = (await memory.stores.imports.listRows(again.importBatchId)).filter((row) => row.action !== 'skip');
  expect(compared.map((row) => row.action)).toEqual(['update']);
  await commit({ importBatchId: again.importBatchId }, actor);
  const lines = await memory.stores.orderLines.listAll?.() ?? [];
  expect(lines).toHaveLength(1);
  expect(lines[0]?.qtyOrdered).toBe(20);
  const submitted = (await memory.stores.imports.listRows(again.importBatchId)).filter((row) => row.action !== 'skip');
  expect(submitted.map((row) => row.action)).toEqual(['update']);
});

it('同一份采购总表再次提交，订单行数量不变，行是不变', async () => {
  const memory = createMemory();
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const clock = new FixedClock(at);
  const ids = new SequentialIds();
  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids, files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock });
  const file = await upload({ memory, bytes: csv(10), originalName: 'po-same.csv' });
  const first = await start({ fileId: entityId(file.sha256), template: 'po-master-v1' }, actor);
  await commit({ importBatchId: first.importBatchId }, actor);
  const again = await start({ fileId: entityId(file.sha256), template: 'po-master-v1' }, actor);
  const compared = (await memory.stores.imports.listRows(again.importBatchId)).filter((row) => row.action !== 'skip');
  expect(compared.map((row) => row.action)).toEqual(['unchanged']);
  await commit({ importBatchId: again.importBatchId }, actor);
  const lines = await memory.stores.orderLines.listAll?.() ?? [];
  expect(lines).toHaveLength(1);
  expect(lines[0]?.qtyOrdered).toBe(10);
  const submitted = (await memory.stores.imports.listRows(again.importBatchId)).filter((row) => row.action !== 'skip');
  expect(submitted.map((row) => row.action)).toEqual(['unchanged']);
});

it('还没提交的批次和读不懂的行不会把下一次比对改成更新', async () => {
  const memory = createMemory();
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const clock = new FixedClock(at);
  const ids = new SequentialIds();
  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids, files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock });
  const file = await upload({ memory, bytes: csv(10), originalName: 'po-draft.csv' });
  const first = await start({ fileId: entityId(file.sha256), template: 'po-master-v1' }, actor);
  await commit({ importBatchId: first.importBatchId }, actor);
  const committed = await memory.stores.imports.get(first.importBatchId);
  const row = (await memory.stores.imports.listRows(first.importBatchId)).find((item) => item.action !== 'skip');
  const line = (await memory.stores.orderLines.listAll?.() ?? [])[0];
  if (row === undefined || line === undefined || !isPayload(row.parsed)) throw new Error('提交后没有订单行');
  await memory.stores.imports.save({ ...committed, id: entityId('draft'), status: 'parsed', revision: 0, committedAt: null, updatedAt: '2026-10-13T00:00:00.000Z' });
  await memory.stores.imports.saveRow({ ...row, id: entityId('draft-row'), importBatchId: entityId('draft'), targetId: line.id, parsed: { ...row.parsed, qtyOrdered: { raw: '1', value: 1 } } });
  await memory.stores.imports.saveRow({ ...row, id: entityId('bad-row'), parsed: null, targetId: null });
  const again = await start({ fileId: entityId(file.sha256), template: 'po-master-v1' }, actor);
  const compared = (await memory.stores.imports.listRows(again.importBatchId)).filter((item) => item.action !== 'skip');
  expect(compared.map((item) => item.action)).toEqual(['unchanged']);
});

it('库里的内容只是键顺序不同时，再次比对仍是不变', async () => {
  const memory = createMemory();
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const clock = new FixedClock(at);
  const ids = new SequentialIds();
  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids, files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock });
  const file = await upload({ memory, bytes: csv(10), originalName: 'po-order.csv' });
  const first = await start({ fileId: entityId(file.sha256), template: 'po-master-v1' }, actor);
  await commit({ importBatchId: first.importBatchId }, actor);
  const row = (await memory.stores.imports.listRows(first.importBatchId)).find((item) => item.action !== 'skip');
  if (row === undefined) throw new Error('提交后没有行');
  await memory.stores.imports.saveRow({ ...row, parsed: jsonbOrder(row.parsed) });
  const again = await start({ fileId: entityId(file.sha256), template: 'po-master-v1' }, actor);
  const compared = (await memory.stores.imports.listRows(again.importBatchId)).filter((item) => item.action !== 'skip');
  expect(compared.map((item) => item.action)).toEqual(['unchanged']);
  const lineBefore = (await memory.stores.orderLines.listAll?.() ?? [])[0];
  await commit({ importBatchId: again.importBatchId }, actor);
  const lineAfter = (await memory.stores.orderLines.listAll?.() ?? [])[0];
  expect(lineAfter?.qtyOrdered).toBe(10);
  expect(lineAfter?.updatedAt).toBe(lineBefore?.updatedAt);
});

it('两次提交时间相同时，后写入的数量才是下一次比对的基准', async () => {
  const memory = createMemory();
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const clock = new FixedClock(at);
  const ids = new SequentialIds();
  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids, files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock });
  const older = await upload({ memory, bytes: csv(10), originalName: 'po-tie-10.csv' });
  const newer = await upload({ memory, bytes: csv(20), originalName: 'po-tie-20.csv' });
  const first = await start({ fileId: entityId(older.sha256), template: 'po-master-v1' }, actor);
  await commit({ importBatchId: first.importBatchId }, actor);
  const second = await start({ fileId: entityId(newer.sha256), template: 'po-master-v1' }, actor);
  await commit({ importBatchId: second.importBatchId }, actor);
  reverseImports(memory);
  const again = await start({ fileId: entityId(older.sha256), template: 'po-master-v1' }, actor);
  const compared = (await memory.stores.imports.listRows(again.importBatchId)).filter((item) => item.action !== 'skip');
  expect(compared.map((item) => item.action)).toEqual(['update']);
  await commit({ importBatchId: again.importBatchId }, actor);
  const lines = await memory.stores.orderLines.listAll?.() ?? [];
  expect(lines).toHaveLength(1);
  expect(lines[0]?.qtyOrdered).toBe(10);
});

function reverseImports(memory: ReturnType<typeof createMemory>): void {
  const entries = [...memory.box.current.imports.entries()].reverse();
  memory.box.current.imports.clear();
  for (const [id, batch] of entries) memory.box.current.imports.set(id, batch);
}

function jsonbOrder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(jsonbOrder);
  if (!isObject(value)) return value;
  const keys = Object.keys(value).sort(jsonbKey);
  const next: Record<string, unknown> = {};
  for (const key of keys) next[key] = jsonbOrder(value[key]);
  return next;
}

function jsonbKey(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPayload(value: unknown): value is { readonly qtyOrdered: { readonly raw: string | null; readonly value: number | null } } {
  return typeof value === 'object' && value !== null && 'qtyOrdered' in value;
}

function csv(qty: number): Uint8Array {
  const headers = [...REQUIRED_COLUMNS];
  const values = headers.map((header) => (header === '订单数量' ? String(qty) : filled[header] ?? ''));
  return new TextEncoder().encode([headers.join(','), values.join(',')].join('\n'));
}

function upload(input: { readonly memory: ReturnType<typeof createMemory>; readonly bytes: Uint8Array; readonly originalName: string }) {
  return input.memory.files.put({ bytes: input.bytes, originalName: input.originalName, mime: 'text/csv' });
}
