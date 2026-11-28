import { expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../packages/domain/src/index.js';
import { template } from '../../packages/importers/src/templates/factory-progress-v1/index.js';
import { scheduleDates } from '../../packages/importers/src/templates/factory-progress-v1/parsers/schedule.js';
import { factoryBook, factoryContext } from './fixtures/factory-progress.js';

const parsed = template.parse(factoryBook, factoryContext);

it('排产计划识别日期列，略过空格，数量和步骤分开保留', () => {
  const schedule = factoryBook.sheets.find((item) => item.name === '排产计划');
  if (schedule === undefined) throw new Error('需要排产计划表');
  expect(scheduleDates(schedule, { date1904: factoryBook.date1904, dateSanityRange: DEFAULT_SETTINGS.dateSanityRange })).toEqual([
    '2026-09-19', '2026-09-20', '2026-09-21',
  ]);
  expect(parsed.schedule.map((row) => row.payload)).toMatchObject([
    { day: '2026-09-19', qty: 25, stepRaw: null },
    { day: '2026-09-20', qty: null, stepRaw: '待检' },
  ]);
});

it('导入隐藏需求表，物料行继承单号并保留自身库存', () => {
  expect(parsed.demand).toMatchObject([
    { rowNo: 3, payload: { role: 'parent', blockPoRaw: 'PO20260101000001', blockMaterialPoRaw: 'MATERIAL-001' } },
    {
      rowNo: 4, payload: { role: 'material', blockPoRaw: 'PO20260101000001', blockMaterialPoRaw: 'MATERIAL-001', qtyOnHand: { value: 20 },
        slots: [
          { sourceColumns: { date: 10, quantity: 11 }, dateRaw: '2026-09-21', qtyRaw: '30' },
          { sourceColumns: { date: 12, quantity: 13 }, dateRaw: '2026-09-24', qtyRaw: '50' },
        ],
      },
      issues: expect.arrayContaining([expect.objectContaining({ code: 'CONTEXT_INHERITED' })]),
    },
    { rowNo: 5, skipReason: 'ROW_REPEATED_HEADER' },
  ]);
});

it('包材组合里的 OK 和待定不作为 BOM 和采购单号', () => {
  expect(parsed.packagingCombo).toMatchObject([
    { payload: { bomCodeRaw: { raw: 'OK', value: null }, materialPoRaw: { raw: '待定', value: null } } },
  ]);
});

it('客供原料标出编码大小写、超范围和不合法日期', () => {
  const issue = (code: string) => expect.arrayContaining([expect.objectContaining({ code })]);
  expect(parsed.customerSupplied).toMatchObject([
    { issues: issue('CODE_CASE') },
    { issues: issue('DATE_OUT_OF_RANGE') },
    { issues: issue('DATE_INVALID') },
  ]);
});
