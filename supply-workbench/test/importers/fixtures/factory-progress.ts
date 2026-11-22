import { SHEETS, type SheetSpec } from '../../../packages/importers/src/templates/factory-progress-v1/spec/index.js';
import { sheet, workbook } from './workbooks.js';

const firstPo = 'PO20260101000001';
const secondPo = 'PO20260101000002';

const header = (spec: SheetSpec) => spec.columns.map((column) => column.name);
const transit = sheet({ name: SHEETS.inTransit.title, rows: [
  header(SHEETS.inTransit),
  [firstPo, '示例面霜', '示例工厂', '6900000000001', 46284, 100, 0, 0, 20, '否', '70000001'],
  [secondPo, '示例精华', '示例供应商乙', null, '2026-09-19', 50, 0, 0, 10, '否', '50000001'],
] });
const shipment = sheet({ name: SHEETS.shipment.title, rows: [
  header(SHEETS.shipment),
  [firstPo, '70000001', '示例面霜', 'LOT-1', 20, null, null, null, '2026-09-19'],
  [null, '70000001', '示例面霜', 'LOT-2', 20, null, null, null, '客户自提'],
], merges: [{ r1: 2, c1: 1, r2: 3, c2: 1 }] });
const stock = sheet({ name: SHEETS.stock.title, rows: [
  header(SHEETS.stock),
  [firstPo, '70000001', '示例面霜', 'LOT-1', 35, null, null, '2026-09-19', '是'],
  [null, null, null, null, null, null, null, null, 'OK'],
] });
const schedule = sheet({ name: SHEETS.schedule.title, rows: [
  [...header(SHEETS.schedule), 46284, 46285, 46286],
  [9, '新品', firstPo, '70000001', '示例面霜', 100, 25, '待检'],
] });
const demand = sheet({ name: '09月排产包材原料需求表', hidden: true, rows: [
  [...header(SHEETS.demand), null],
  ['到货时间', '数量'],
  ['MATERIAL-001', firstPo, '70000001', '示例面霜'],
  [null, null, '99000001', '示例盖子', '个', 90, 100, 20, 80],
  header(SHEETS.demand),
] });
const packagingCombo = sheet({ name: SHEETS.packagingCombo.title, rows: [
  header(SHEETS.packagingCombo),
  [firstPo, '70000001', '示例面霜', '50ml', 100, '示例容器', 'OK', '待定'],
] });
const customerSupplied = sheet({ name: SHEETS.customerSupplied.title, rows: [
  header(SHEETS.customerSupplied),
  ['2026-09-19', 1, 'k10001', '示例原料', 'LOT-1', 1, 20, 20, '2027-09-19'],
  ['1900-01-01', 2, '99000002', '示例原料乙'],
  ['2026/2/30', 3, '99000003', '示例原料丙'],
] });

export const factoryBook = workbook([transit, shipment, stock, schedule, demand, packagingCombo, customerSupplied, sheet({ name: '其他说明', rows: [['示例']] })]);
export const factoryContext = { uploadedAt: '2026-10-12T00:00:00.000Z', factoryPartyId: 'factory-demo', factoryNameRaw: '示例工厂' };
