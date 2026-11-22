import { expect, it } from 'vitest';
import { entityId } from '../../packages/domain/src/index.js';
import { makeCommitImport, makeStartImport } from '../../packages/application/src/imports/index.js';
import { templates } from '../../packages/importers/src/registry.js';
import { SHEETS } from '../../packages/importers/src/templates/factory-progress-v1/spec/index.js';
import { workbookReader } from '../../packages/importers/src/workbook/index.js';
import { write } from '../../packages/report-renderers/src/xlsx/writer.js';
import { aUser, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';
import './load-import-registry.js';

function factoryWorkbook(delivered: readonly number[]): Uint8Array {
  const rows = delivered.map((quantity, index) => [
    'PO20260920000001', '面膜', '宜侬', String(6975853662700 + index),
    '2026-09-20', 100, quantity, 0, 100 - quantity, '否', String(70007018 + index),
  ]);
  return write({ sheets: [SHEETS.inTransit, SHEETS.shipment, SHEETS.stock].map((sheet) => ({
    name: sheet.title,
    rows: [sheet.columns.map((column) => column.name), ...(sheet === SHEETS.inTransit ? rows : [])],
  })) });
}

it('工厂整表刷新按当前有效版本比对，改回旧值的明细仍是本次变化', async () => {
  const memory = createMemory();
  const clock = new FixedClock('2026-11-19T01:00:00.000Z');
  const actor = aUser({ roles: ['buyer'] });
  const start = makeStartImport({ uow: memory.unitOfWork, clock, ids: new SequentialIds(), files: memory.files, workbooks: workbookReader(), templates });
  const commit = makeCommitImport({ uow: memory.unitOfWork, clock });

  async function upload(quantities: readonly number[]) {
    const file = await memory.files.put({ bytes: factoryWorkbook(quantities), originalName: '宜侬.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const { importBatchId } = await start({ fileId: entityId(file.sha256), template: 'factory-progress-v1', factoryPartyId: entityId('factory-yinong') }, actor);
    return importBatchId;
  }

  const first = await upload([10, 3]);
  await commit({ importBatchId: first }, actor);
  const second = await upload([20, 3]);
  await commit({ importBatchId: second }, actor);
  const third = await upload([10, 3, 7]);
  const preview = await memory.stores.imports.listRows(third);
  expect(preview.map((row) => [row.rowNo, row.action])).toEqual([[2, 'create'], [3, 'unchanged'], [4, 'create']]);
});
