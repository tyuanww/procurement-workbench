import { expect, it } from 'vitest';
import { entityId } from '../../packages/domain/src/index.js';
import { makeDetectImportFile, makeStartImport } from '../../packages/application/src/imports/index.js';
import { ImportFactoryRequiredError } from '../../packages/application/src/shared/errors.js';
import { templates } from '../../packages/importers/src/registry.js';
import { workbookReader } from '../../packages/importers/src/workbook/index.js';
import { aUser, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import './load-import-registry.js';

const at = '2026-10-12T00:00:00.000Z';

it('识别结果保留全部候选和代工厂推导，开始解析只认显式模板', async () => {
  const memory = createMemory();
  const bytes = new TextEncoder().encode('供应商,产品名称\n甲代工厂,面膜\n');
  const stored = await memory.files.put({ bytes, originalName: 'choice.csv', mime: 'text/csv' });
  const actor = aUser({ id: entityId('buyer-1'), roles: ['buyer'], name: '采购' });
  const clock = new FixedClock(at);
  const ids = new SequentialIds();
  const detect = makeDetectImportFile({ uow: memory.unitOfWork, clock, ids, files: memory.files, workbooks: workbookReader(), templates });
  const detected = await detect({ fileName: 'choice.csv', mime: 'text/csv', bytes }, actor);
  expect(detected.requiresFactory).toBe(false);
  expect(detected.candidates.map((item) => item.template)).toContain('po-master-v1');
  expect(detected.candidates.map((item) => item.template)).toContain('factory-progress-v1');
  expect(detected.candidates.find((item) => item.template === 'factory-progress-v1')?.score).toBe(0);

  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids, files: memory.files, workbooks: workbookReader(), templates });
  const fileId = entityId(stored.sha256);
  await expect(start({ fileId, template: 'factory-progress-v1' }, actor)).rejects.toBeInstanceOf(ImportFactoryRequiredError);
  const started = await start({ fileId, template: 'bom-v1' }, actor);
  expect((await memory.stores.imports.get(started.importBatchId)).template).toBe('bom-v1');
});
