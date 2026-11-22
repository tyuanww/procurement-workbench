import { entityId } from '@sw/domain';
import { csvBytes, poCsv } from '../../../../test/importers/fixtures/workbooks.js';
import { BOM_COLUMNS } from '../../../../packages/importers/src/templates/bom-v1/columns.js';
import { REQUIRED_COLUMNS } from '../../../../packages/importers/src/templates/product-archive-v1/columns.js';
import type { composeImports } from '../../src/composition/imports.js';

export const buyer = { id: entityId('0199f0a0-0000-7000-8000-000000000002'), name: '采购', roles: ['buyer'] as const };
export const barcode = '6900000000001';
export const itemCode = '70000001';
export const channels = [barcode, `${barcode}-2`, `${barcode}-3`];
export const supplier = '示例工厂';

export function demoPo() {
  return poCsv(channels.map((code, index) => ({
    供应商: supplier, 产品名称: `示例面霜${index + 1}`, 产品条码: code,
    采购订单号: `PO2026010100000${index + 1}`, 订单数量: '100', 状态: '进行中',
  })));
}

export function demoArchive() {
  return csvBytes([REQUIRED_COLUMNS, ...channels.map((code, index) => (
    ['示例备案名', 'DEMO-001', `示例面霜${index + 1}`, code, '50ml', null, null, '24', '200*150*120', '示例联系人']
  )), ['示例护手霜', 'DEMO-002', '示例护手霜', '6900000000002']]);
}

export function demoBom() {
  return csvBytes([BOM_COLUMNS, [barcode, '示例面霜', 1, 100, '9900000001', '示例子件']]);
}

export async function importCsv(api: ReturnType<typeof composeImports>, file: {
  readonly fileName: string;
  readonly bytes: Uint8Array;
  readonly template: 'po-master-v1' | 'product-archive-v1' | 'bom-v1';
}): Promise<string> {
  const detected = await api.detect({ fileName: file.fileName, mime: 'text/csv', bytes: file.bytes }, buyer);
  const started = await api.start({ fileId: entityId(textOf(detected, 'fileId')), template: file.template }, buyer);
  const batchId = textOf(started, 'importBatchId');
  await api.commit(batchId, buyer);
  return batchId;
}

function textOf(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null) throw new Error(`没有 ${key}`);
  const field: unknown = Reflect.get(value, key);
  if (typeof field !== 'string') throw new Error(`没有 ${key}`);
  return field;
}
