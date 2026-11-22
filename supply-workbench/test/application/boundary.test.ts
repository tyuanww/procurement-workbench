import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, expectTypeOf, it } from 'vitest';
import type { OrderLineRow } from '../../packages/application/src/follow-up/boundary.js';
import * as followUp from '../../packages/application/src/follow-up/index.js';
import * as imports from '../../packages/application/src/imports/index.js';
import * as platform from '../../packages/application/src/platform/index.js';

const portsDir = path.resolve(import.meta.dirname, '../../packages/application/src/ports');

it('端口文件只导出类型，没有运行时代码', () => {
  const files = readdirSync(portsDir).filter((name) => name.endsWith('.ts'));
  expect(files.length).toBeGreaterThan(0);
  for (const name of files) {
    const text = readFileSync(path.join(portsDir, name), 'utf8');
    expect(text, name).not.toMatch(/export (function|const|class|let) /);
  }
});

it('各能力导出的用例工厂和 08 第 9 节一致', () => {
  expect(Object.keys(platform).sort()).toEqual(
    ['makeCreateUser', 'makeGetFreshness', 'makeGetSettings', 'makeListAuditEntries', 'makeListUsers', 'makeUpdateSettings', 'makeUpdateUser'].sort(),
  );
  expect(Object.keys(imports).sort()).toEqual(
    [
      'makeCommitImport',
      'makeDetectImportFile',
      'makeDiscardImport',
      'makeDiscardStaleImports',
      'makeGetFactoryTemplate',
      'makeGetImportBatch',
      'makeGetProcurementPreview',
      'makeListImportBatches',
      'makeListImportRows',
      'makeSaveImportDecisions',
      'makeStartImport',
    ].sort(),
  );
  expect(Object.keys(followUp)).toContain('makeRecordReceipt');
  expect(Object.keys(followUp)).toContain('makeGenerateBatchesFromDemand');
});

const orderLineRowFields = [
  'id',
  'lane',
  'po',
  'nameRaw',
  'itemCodeRaw',
  'barcodeRaw',
  'supplier',
  'factory',
  'receiver',
  'qtyOrdered',
  'receivedQty',
  'factoryDeliveredQty',
  'stage',
  'nextDue',
  'daysInStage',
  'buyer',
  'statusReported',
  'missingInLatestImport',
  'latestImportPresence',
  'openExceptionCount',
  'origin',
  'storeProgress',
] as const;

it('OrderLineRow 的字段和 05 第 4.3 节及管理店铺扩展一致', () => {
  expect(orderLineRowFields).toHaveLength(22);
  expectTypeOf<keyof OrderLineRow>().toEqualTypeOf<(typeof orderLineRowFields)[number]>();
});
