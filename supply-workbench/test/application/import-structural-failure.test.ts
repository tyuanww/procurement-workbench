import { expect, it } from 'vitest';
import { entityId } from '../../packages/domain/src/index.js';
import { makeCommitImport, makeStartImport } from '../../packages/application/src/imports/index.js';
import { templates } from '../../packages/importers/src/registry.js';
import { workbookReader } from '../../packages/importers/src/workbook/index.js';
import { aUser, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import './load-import-registry.js';

const at = '2026-10-12T00:00:00.000Z';

it('采购总表缺表头时不能提交成功，批次保持失败并且写明原因', async () => {
  const memory = createMemory();
  const bytes = new TextEncoder().encode('供应商,产品名称\n宜侬,面膜\n');
  const stored = await memory.files.put({ bytes, originalName: 'missing.csv', mime: 'text/csv' });
  const clock = new FixedClock(at);
  const ids = new SequentialIds();
  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids, files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock });
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const started = await start({ fileId: entityId(stored.sha256), template: 'po-master-v1' }, actor);
  const parsed = await memory.stores.imports.get(started.importBatchId);
  expect(parsed.status).toBe('failed');
  expect(parsed.error).toContain('表头');
  await expect(commit({ importBatchId: started.importBatchId }, actor)).rejects.toThrow(/不允许/);
  const after = await memory.stores.imports.get(started.importBatchId);
  expect(after.status).toBe('failed');
  expect(after.committedAt).toBeNull();
});

it('BOM 第一行不是表头时不能提交成功', async () => {
  const memory = createMemory();
  const bytes = new TextEncoder().encode('产品条码,产品名称,数量\n6901234567890,面霜,2\n');
  const stored = await memory.files.put({ bytes, originalName: 'bom-bad.csv', mime: 'text/csv' });
  const clock = new FixedClock(at);
  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids: new SequentialIds(), files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock });
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const started = await start({ fileId: entityId(stored.sha256), template: 'bom-v1' }, actor);
  const parsed = await memory.stores.imports.get(started.importBatchId);
  expect(parsed.status).toBe('failed');
  expect(parsed.error).toContain('表头');
  await expect(commit({ importBatchId: started.importBatchId }, actor)).rejects.toThrow(/不允许/);
  expect((await memory.stores.imports.get(started.importBatchId)).committedAt).toBeNull();
});
