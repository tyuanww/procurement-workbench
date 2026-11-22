import { expect, it } from 'vitest';
import {COVERAGE_LABEL, COVERAGE_NOTE, HANDLING_HINT_LABEL, SHARED_PART_LABEL, UNFILED_FILING_NAME, applyProductEdit, barcodeBase, countOpenPurchaseLines, matchChannel, materialLinkCoverage, mergeProductReimport, purchaseDistribution, resolveFactoryStock, sharedParts, spuKey, validateContacts, type Product, type PurchaseLine, entityId, productId} from '../../packages/domain/src/index.js';

const FAMILY = '2000000003023';
const TABLE: readonly { readonly barcode: string; readonly exact: number; readonly all: number; readonly inProgress: number }[] = [
  { barcode: FAMILY, exact: 7, all: 15, inProgress: 4 },
  { barcode: `${FAMILY}-2`, exact: 4, all: 15, inProgress: 4 },
  { barcode: `${FAMILY}-3`, exact: 4, all: 15, inProgress: 4 },
  { barcode: '2000000003030', exact: 4, all: 4, inProgress: 2 },
  { barcode: '2000000003047', exact: 7, all: 7, inProgress: 3 },
  { barcode: '2000000003092', exact: 5, all: 5, inProgress: 1 },
  { barcode: '2000000003085', exact: 1, all: 1, inProgress: 1 },
  { barcode: '2000000003122', exact: 1, all: 1, inProgress: 0 },
  { barcode: '2000000003054', exact: 1, all: 1, inProgress: 1 },
  { barcode: '2000000003061', exact: 2, all: 2, inProgress: 2 },
  { barcode: '2000000003078', exact: 2, all: 2, inProgress: 1 },
  { barcode: '2000000003108', exact: 1, all: 1, inProgress: 0 },
  { barcode: '2000000003115', exact: 1, all: 1, inProgress: 1 },
  { barcode: '2000000003139', exact: 3, all: 3, inProgress: 3 },
];

function productOf(barcode: string) {
  return { barcodeRaw: barcode, barcodeBase: barcodeBase(barcode) };
}

function linesOf(): PurchaseLine[] {
  const lines: PurchaseLine[] = [];
  for (const row of TABLE) {
    if (row.barcode.includes('-')) continue;
    for (let index = 0; index < row.exact; index += 1) {
      lines.push({ barcodeRaw: row.barcode, reportedStatus: index < row.inProgress ? '进行中' : '已完成', stage: 'no_batch' });
    }
  }
  for (const suffix of ['-2', '-3']) {
    const exact = TABLE.find((row) => row.barcode === `${FAMILY}${suffix}`)?.exact ?? 0;
    for (let index = 0; index < exact; index += 1) {
      lines.push({ barcodeRaw: `${FAMILY}${suffix}`, reportedStatus: '已完成', stage: 'no_batch' });
    }
  }
  return lines;
}

it('渠道匹配分别统计本条码和全部关联渠道', () => {
  const lines = linesOf();
  for (const row of TABLE) {
    const product = productOf(row.barcode);
    const exact = lines.filter((line) => matchChannel({ lineBarcode: line.barcodeRaw, product, scope: 'exact' }) !== null).length;
    const all = lines.filter((line) => matchChannel({ lineBarcode: line.barcodeRaw, product, scope: 'all_channels' }) !== null).length;
    const inProgress = lines.filter((line) => matchChannel({ lineBarcode: line.barcodeRaw, product, scope: 'all_channels' }) !== null && line.reportedStatus === '进行中').length;
    expect(exact, row.barcode).toBe(row.exact);
    expect(all, row.barcode).toBe(row.all);
    expect(inProgress, row.barcode).toBe(row.inProgress);
  }
});

it('-2、-3 不和基础码合并成一个产品', () => {
  expect(barcodeBase(`${FAMILY}-2`)).toBe(FAMILY);
  const fullwidthFamily = FAMILY.replace(/\d/g, (digit) => String.fromCharCode(0xff10 + Number(digit)));
  expect(barcodeBase(`${fullwidthFamily}－2`)).toBe(FAMILY);
  expect(`${FAMILY}-2`).not.toBe(FAMILY);
  expect(matchChannel({ lineBarcode: FAMILY, product: productOf(`${FAMILY}-2`), scope: 'exact' })).toBeNull();
  expect(matchChannel({ lineBarcode: FAMILY, product: productOf(`${FAMILY}-2`), scope: 'all_channels' })).toBe('sibling_channel');
});

it('品名相同、条码不同的订单行不关联', () => {
  expect(matchChannel({ lineBarcode: '2000000003030', product: productOf(FAMILY), scope: 'all_channels' })).toBeNull();
});

it('no_batch 的已完成订单行不算未完结，进行中的算', () => {
  const product = productOf(FAMILY);
  const lines = linesOf();
  expect(countOpenPurchaseLines({ lines, product, scope: 'all_channels' })).toBe(4);
  const closed = [{ barcodeRaw: FAMILY, reportedStatus: '已完成', stage: 'no_batch' as const }];
  expect(countOpenPurchaseLines({ lines: closed, product, scope: 'exact' })).toBe(0);
  const waiting = [{ barcodeRaw: FAMILY, reportedStatus: '已完成', stage: 'awaiting_date' as const }];
  expect(countOpenPurchaseLines({ lines: waiting, product, scope: 'exact' })).toBe(1);
});

it('没有备案名称的产品单独成组，不从品名猜系列', () => {
  expect(spuKey(null)).toBeNull();
  expect(spuKey('  ')).toBeNull();
  expect(spuKey('店铺甲海葡萄水光冰冰贴')).toBe('店铺甲海葡萄水光冰冰贴');
  expect(UNFILED_FILING_NAME).toBe('未填备案名称');
});

it('没有已批准对照时库存给出审核入口，对照上了但库存表没有记录就不给这个入口', () => {
  expect(resolveFactoryStock({ barcodeRaw: FAMILY, approvedLinks: [], stockRows: [{ codeNorm: '70007022', qty: 3, importBatchId: 'b1' }] }).kind).toBe('missing');
  const none = resolveFactoryStock({ barcodeRaw: FAMILY, approvedLinks: [{ leftNorm: FAMILY, rightNorm: '70007022' }], stockRows: [] });
  expect(none).toEqual({ kind: 'missing', missing: { value: null, reason: 'no_matching_record' }, nextStep: null });
  const linked = resolveFactoryStock({ barcodeRaw: '2000000003047', approvedLinks: [{ leftNorm: '2000000003047', rightNorm: '70007021' }], stockRows: [
    { codeNorm: '70007021', qty: 2, importBatchId: 'stock' },
    { codeNorm: '70007021', qty: 5, importBatchId: 'stock' },
  ] });
  expect(linked).toEqual({ kind: 'linked', rows: [
    { codeNorm: '70007021', qty: 2, importBatchId: 'stock' },
    { codeNorm: '70007021', qty: 5, importBatchId: 'stock' },
  ], total: 7 });
});

it('库存行不是同一导入批次时不合计，也不把缺失数量写成 0', () => {
  const mixed = resolveFactoryStock({ barcodeRaw: FAMILY, approvedLinks: [{ leftNorm: FAMILY, rightNorm: '70007022' }], stockRows: [
    { codeNorm: '70007022', qty: 1, importBatchId: 'a' },
    { codeNorm: '70007022', qty: 2, importBatchId: 'b' },
  ] });
  expect(mixed.kind === 'linked' && mixed.total).toBeNull();
  const gap = resolveFactoryStock({ barcodeRaw: FAMILY, approvedLinks: [{ leftNorm: FAMILY, rightNorm: '70007022' }], stockRows: [
    { codeNorm: '70007022', qty: null, importBatchId: 'a' },
  ] });
  expect(gap.kind === 'linked' && gap.total).toBeNull();
});

it('没有 BOM 的产品组成物料是 no_bom，不是 0', () => {
  expect(materialLinkCoverage([])).toEqual({ kind: 'no_bom' });
  expect(materialLinkCoverage([{ partCodeRaw: 'p1', linked: false }, { partCodeRaw: 'p2', linked: true }])).toEqual({ linked: 1, total: 2 });
});

it('同一个子件出现在多个产品里才算共用件', () => {
  const uses = [
    { productBarcodeRaw: 'a', partCodeRaw: 'shared' },
    { productBarcodeRaw: 'b', partCodeRaw: 'shared' },
    { productBarcodeRaw: 'a', partCodeRaw: 'only' },
  ];
  expect(sharedParts(uses)).toEqual([{ partCodeRaw: 'shared', productCount: 2, products: ['a', 'b'] }]);
});

it('工作台改过的字段不被重新导入覆盖，并报 PRODUCT_FIELD_KEPT', () => {
  const current = sampleProduct({ fieldSources: { skuName: 'workbench', filingName: 'import' } });
  const plan = mergeProductReimport(
    { product: current, images: [], contacts: [] },
    { fields: { skuName: '文件品名', filingName: '新备案' }, images: [], contacts: [] },
  );
  expect(plan.fields.filingName).toBe('新备案');
  expect(plan.fields.skuName).toBeUndefined();
  expect(plan.issues.map((issue) => issue.code)).toEqual(['PRODUCT_FIELD_KEPT']);
  expect(plan.issues[0]?.message).toContain('工作台品名');
});

it('上传的图片不被替换，隐藏过的同一文件仍然隐藏', () => {
  const current = sampleProduct();
  const plan = mergeProductReimport(
    {
      product: current,
      images: [
        { slot: 'inner', sha256: 'upload-1', source: 'upload', hiddenAt: null },
        { slot: 'outer', sha256: 'import-1', source: 'import', hiddenAt: '2026-10-01T00:00:00.000Z' },
      ],
      contacts: [
        { role: 'product_info', userId: null, nameRaw: '档案人', source: 'import' },
        { role: 'purchasing', userId: entityId('u1'), nameRaw: null, source: 'workbench' },
      ],
    },
    {
      fields: {},
      images: [{ slot: 'outer', sha256: 'import-1', source: 'import', hiddenAt: null }, { slot: 'outer', sha256: 'import-2', source: 'import', hiddenAt: null }],
      contacts: [{ role: 'product_info', userId: null, nameRaw: '新人', source: 'import' }],
    },
  );
  expect(plan.images).toEqual([
    { slot: 'inner', sha256: 'upload-1', source: 'upload', hiddenAt: null },
    { slot: 'outer', sha256: 'import-1', source: 'import', hiddenAt: '2026-10-01T00:00:00.000Z' },
    { slot: 'outer', sha256: 'import-2', source: 'import', hiddenAt: null },
  ]);
  expect(plan.contacts).toEqual([
    { role: 'purchasing', userId: 'u1', nameRaw: null, source: 'workbench' },
    { role: 'product_info', userId: null, nameRaw: '新人', source: 'import' },
  ]);
});

it('重新导入不能把必填品名写成空', () => {
  const plan = mergeProductReimport(
    { product: sampleProduct({ fieldSources: { skuName: 'import' } }), images: [], contacts: [] },
    { fields: { skuName: null }, images: [], contacts: [] },
  );
  expect(plan.fields.skuName).toBeUndefined();
  expect(plan.issues).toEqual([]);
});

it('工作台修改把字段来源改成 workbench', () => {
  const edited = applyProductEdit({ current: sampleProduct(), patch: { productLine: '常规款' }, editor: { by: entityId('reviewer'), at: '2026-10-12T00:00:00.000Z' } });
  expect(edited.productLine).toBe('常规款');
  expect(edited.fieldSources.productLine).toBe('workbench');
  expect(edited.barcodeRaw).toBe(FAMILY);
});

it('联系人至少要有用户或名字', () => {
  expect(validateContacts({ userId: null, nameRaw: ' ' })).toBe(false);
  expect(validateContacts({ userId: null, nameRaw: '甲' })).toBe(true);
  expect(validateContacts({ userId: 'u1', nameRaw: null })).toBe(true);
});

it('产品档案文案里没有齐套', () => {
  for (const text of [COVERAGE_LABEL, COVERAGE_NOTE, SHARED_PART_LABEL, HANDLING_HINT_LABEL, UNFILED_FILING_NAME]) {
    expect(text.includes('齐套')).toBe(false);
  }
});

it('采购分布按阶段计数，没有的阶段是 0 条而不是缺失', () => {
  const product = productOf(FAMILY);
  const lines: PurchaseLine[] = [{ barcodeRaw: FAMILY, reportedStatus: '进行中', stage: 'awaiting_date' }];
  const distribution = purchaseDistribution({ lines, product, scope: 'exact' });
  expect(distribution.byStage.awaiting_date).toBe(1);
  expect(distribution.byStage.no_batch).toBe(0);
  expect(distribution.byReportedStatus).toEqual({ 进行中: 1 });
});

function sampleProduct(patch: Partial<Product> = {}): Product {
  return {
    id: productId('p1'),
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    barcodeRaw: FAMILY,
    barcodeBase: FAMILY,
    filingName: '店铺甲海葡萄水光冰冰贴',
    spuKey: '店铺甲海葡萄水光冰冰贴',
    filingNo: null,
    skuName: '工作台品名',
    netContent: null,
    casePack: null,
    outerSize: null,
    productLine: null,
    fieldSources: {},
    importBatchId: null,
    rowNo: null,
    editedBy: null,
    editedAt: null,
    ...patch,
  };
}
