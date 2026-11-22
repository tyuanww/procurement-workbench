import { expect, it } from 'vitest';
import { BOM_COLUMNS } from '../../packages/importers/src/templates/bom-v1/columns.js';
import { template as bom } from '../../packages/importers/src/templates/bom-v1/index.js';
import { REQUIRED_COLUMNS } from '../../packages/importers/src/templates/product-archive-v1/columns.js';
import { mountImages, productInfoContacts, readHeader, template as archive } from '../../packages/importers/src/templates/product-archive-v1/index.js';
import { describeImportTemplateContract } from '../../packages/testkit/src/contracts/import-template.js';
import { sheet, workbook } from './fixtures/workbooks.js';

const context = { uploadedAt: '2026-10-12T00:00:00.000Z', factoryPartyId: null };
const archiveSheet = sheet({
  name: '产品档案',
  rows: [
    REQUIRED_COLUMNS,
    ['示例备案名', 'DEMO-001', '示例面霜', '6900000000001', '50ml', null, null, '24', '200*150*120', '示例联系人'],
  ],
  images: [
    { row: 2, col: 6, fileName: 'inner.png', data: new Uint8Array() },
    { row: 2, col: 7, fileName: 'outer.png', data: new Uint8Array() },
    { row: 2, col: 8, fileName: 'unrelated.png', data: new Uint8Array() },
  ],
});
const archiveBook = workbook([archiveSheet]);
const bomBook = workbook([sheet({
  name: 'BOM',
  rows: [
    BOM_COLUMNS,
    ['6900000000001', '示例面霜', 2, 220, '9900000001', '示例盖'],
    ['6900000000001', '示例面霜', null, null, '9900000002', '示例盒'],
    BOM_COLUMNS,
    ['6900000000002', '示例精华', 1, 120, '9900000001', '示例盖'],
  ],
  merges: [{ r1: 2, c1: 3, r2: 3, c2: 3 }, { r1: 2, c1: 4, r2: 3, c2: 4 }],
})]);

it('产品档案把图片挂到对应包装槽，从对接人列提取联系人', () => {
  const parsed = archive.parse(archiveBook, context);
  expect(parsed.rows).toMatchObject([{ rowNo: 2, payload: { barcodeRaw: { value: '6900000000001' } } }]);
  expect(mountImages(archiveSheet, readHeader(archiveSheet).columns)).toMatchObject([
    { row: 2, slot: 'inner', fileName: 'inner.png' },
    { row: 2, slot: 'outer', fileName: 'outer.png' },
  ]);
  expect(productInfoContacts(parsed.rows)).toEqual([
    { rowNo: 2, nameRaw: '示例联系人', role: 'product_info', source: 'import' },
  ]);
});

it('BOM 保留合并数量和共用子件，跳过重复表头', () => {
  const parsed = bom.parse(bomBook, context);
  expect(parsed.rows).toMatchObject([
    { rowNo: 2, payload: { productBarcodeRaw: '6900000000001', partCodeRaw: '9900000001', reorderCount: 2, cumulativeQty: 220, mergedFill: false } },
    { rowNo: 3, payload: { productBarcodeRaw: '6900000000001', partCodeRaw: '9900000002', reorderCount: 2, cumulativeQty: 220, mergedFill: true }, issues: [{ code: 'MERGED_FILL' }] },
    { rowNo: 4, skipReason: 'ROW_REPEATED_HEADER' },
    { rowNo: 5, payload: { productBarcodeRaw: '6900000000002', partCodeRaw: '9900000001', cumulativeQty: 120, mergedFill: false } },
  ]);
});

describeImportTemplateContract(archive, { ownFile: archiveBook, foreignFile: bomBook });
describeImportTemplateContract(bom, { ownFile: bomBook, foreignFile: archiveBook });
