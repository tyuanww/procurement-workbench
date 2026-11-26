import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { archiveImageMounts } from '../../packages/application/src/imports/use-cases/archive-images.js';
import { generateProductWorkbookTemplate, parseProductWorkbook, readXlsx } from '../../packages/importers/src/index.js';

const requireImporter = createRequire(new URL('../../packages/importers/package.json', import.meta.url));
const xlsx = requireImporter('xlsx');
const { strFromU8, unzipSync, zipSync } = requireImporter('fflate');
const barcode = '0690000012345';
const partCode = '9900000001';
const archive = { name: '产品档案', rows: [['产品条码', 'SKU名称'], [barcode, '合成商品']] };
const materials = { name: '组成物料', rows: [['产品条码', '子件条码'], [barcode, partCode]] };

it.each([
  { name: archive.name, duplicate: '　产品档案', rows: [['产品条码', 'SKU名称'], [barcode, '另一份档案']], isHidden: false },
  { name: archive.name, duplicate: '产品档案 ', rows: [['产品条码', 'SKU名称'], [barcode, '另一份档案']], isHidden: true },
  { name: materials.name, duplicate: '组成物料 ', rows: [['产品条码', '子件条码'], [barcode, '9900000002']], isHidden: false },
  { name: materials.name, duplicate: ' 组成物料', rows: [['产品条码', '子件条码'], [barcode, '9900000002']], isHidden: true },
])('拒绝名称去掉首尾空格后重复的工作表（$duplicate，隐藏 $isHidden）', async ({ name, duplicate, rows, isHidden }) => {
  const workbook = makeWorkbook([archive, materials, { name: duplicate, rows, isHidden }]);
  expect(workbook.sheets.at(-1)).toMatchObject({ name: duplicate, hidden: isHidden });
  const parsed = await parseProductWorkbook(workbook, { putImage: unexpectedImage });
  expect(parsed).toMatchObject({
    issues: [{ sheet: name, row: null, field: null, message: expect.stringContaining('合并数据') }],
    products: [],
    materials: [],
  });
});

it('接受唯一的业务工作表和旧模板的图片索引', async () => {
  const workbook = makeWorkbook([
    archive,
    { ...materials, name: '组成物料 ' },
    { name: '图片索引', rows: [['图片文件']] },
  ]);
  const parsed = await parseProductWorkbook(workbook, { putImage: unexpectedImage });
  expect(parsed).toMatchObject({ issues: [], products: [{ barcode }], materials: [{ barcode, partCode }] });
});

it('工作簿模板把产品和子件条码列设为文本，以输入开头有 0 的标识', () => {
  const files = unzipSync(generateProductWorkbookTemplate());
  const styles = strFromU8(files['xl/styles.xml']);
  const xfs = styles.match(/<cellXfs[^>]*>(.*?)<\/cellXfs>/u)?.[1] ?? '';
  const textStyle = [...xfs.matchAll(/<xf\b[^>]*>/gu)].findIndex(([tag]) => tag.includes('numFmtId="49"'));
  expect(textStyle).toBeGreaterThan(0);
  for (const [name, barcodeColumns] of [['sheet1', [4]], ['sheet2', [1, 5]]] as const) {
    const sheet = strFromU8(files[`xl/worksheets/${name}.xml`]);
    for (const column of barcodeColumns) {
      expect(sheet).toMatch(new RegExp(`<col\\b(?=[^>]*\\bmin="${column}")(?=[^>]*\\bmax="${column}")(?=[^>]*\\bstyle="${textStyle}")[^>]*>`, 'u'));
    }
  }
});

it('组成物料更新和删除都保留数字格显示的子件条码前导零，并读到第 41 列的操作', async () => {
  const header = ['产品条码', '子件条码', '子件名称', ...Array<string>(37).fill(''), '操作'];
  const workbook = makeWorkbook([archive, {
    name: materials.name,
    rows: [header, [barcode, 990000001, '合成包材'], [barcode, 990000002, '', ...Array<string>(37).fill(''), '删除']],
    cells: { B2: { t: 'n', v: 990000001, z: '0000000000' }, B3: { t: 'n', v: 990000002, z: '0000000000' } },
  }]);
  const parsed = await parseProductWorkbook(workbook, { putImage: unexpectedImage });
  expect(parsed).toMatchObject({ issues: [], materials: [
    { partCode: '0990000001', operation: 'upsert', partName: '合成包材' },
    { partCode: '0990000002', operation: 'remove' },
  ] });
});

it('完整条码的有效原值与显示值冲突时提示改成明确的文本', async () => {
  const workbook = makeWorkbook([{
    ...archive,
    cells: { A2: { t: 'n', v: 6900000000001, z: '0000000000000"-2"' } },
  }]);
  const parsed = await parseProductWorkbook(workbook, { putImage: unexpectedImage });
  expect(parsed.products).toEqual([]);
  expect(parsed.issues).toEqual([{ sheet: archive.name, row: 2, field: '产品条码', message: expect.stringContaining('显示值') }]);
});

it.each([
  { name: '大数正好四位小数', value: 16777216.0001, accepted: 16777216.0001 },
  { name: '极小值超过四位小数', value: 0.0000000001, accepted: null },
  { name: '文本数量超出可保留精度', value: '16777216.00010000001', accepted: null },
  { name: '万单位换算后正好四位小数', value: '1677.72160001w', accepted: 16777216.0001 },
])('按实际十进制精度核对累计数量（$name）', async ({ value, accepted }) => {
  const workbook = makeWorkbook([archive, {
    name: materials.name,
    rows: [['产品条码', '子件条码', '累计数量'], [barcode, partCode, value]],
  }]);
  const parsed = await parseProductWorkbook(workbook, { putImage: unexpectedImage });
  expect(parsed.materials).toMatchObject([{ cumulativeQty: accepted }]);
  if (accepted === null) {
    expect(parsed.issues).toEqual([{ sheet: materials.name, row: 2, field: '累计数量', message: expect.stringContaining('4 位小数') }]);
  } else {
    expect(parsed.issues).toEqual([]);
  }
});

it.each(['sheetjs', 'xml'] as const)('拒绝没有有效结果的数量公式（%s）', async (engine) => {
  const workbook = makeWorkbook([archive, {
    name: materials.name,
    rows: [['产品条码', '子件条码', '累计数量'], [barcode, partCode, 0]],
    cells: { C2: { t: 'n', f: '1+1' } },
  }], { engine });
  const parsed = await parseProductWorkbook(workbook, { putImage: unexpectedImage });
  expect(parsed.issues).toEqual([{ sheet: materials.name, row: 2, field: '累计数量', message: expect.stringContaining('公式') }]);
});

it.each([
  { column: 2, broken: true, field: '外包装图片', message: '无法读取' },
  { column: 3, broken: false, field: '包装图片', message: 'D2' },
])('提示关系缺失或锚定错列的包装图片（$field）', async ({ column, broken, field, message }) => {
  const bytes = workbookBytes([{ ...archive, rows: [['产品条码', 'SKU名称', '外包装图片'], [barcode, '合成商品']] }]);
  const files = unzipSync(bytes);
  files['xl/worksheets/_rels/sheet1.xml.rels'] = Buffer.from('<Relationships><Relationship Target="/xl/drawings/drawing1.xml" Id="rId1"/></Relationships>');
  files['xl/drawings/drawing1.xml'] = Buffer.from(`<wsDr><oneCellAnchor><from><col>${column}</col><row>1</row></from><pic><a:blip r:embed="rId1"/></pic></oneCellAnchor></wsDr>`);
  if (!broken) {
    files['xl/drawings/_rels/drawing1.xml.rels'] = Buffer.from('<Relationships><Relationship Target="/xl/media/packing.png" Id="rId1"/></Relationships>');
    files['xl/media/packing.png'] = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/6XobYQAAAAASUVORK5CYII=', 'base64');
  }
  const workbook = readXlsx({ bytes: zipSync(files), fileName: 'synthetic.xlsx' });
  const parsed = await parseProductWorkbook(workbook, { putImage: unexpectedImage });
  expect(parsed.issues).toEqual([{ sheet: archive.name, row: 2, field, message: expect.stringContaining(message) }]);
  if (broken) expect(await archiveImageMounts(workbook, unexpectedImage)).toEqual([]);
});

it.each([
  { t: 's', v: '包装.png' },
  { t: 'n', f: 'IMAGE("包装.png")' },
])('提示未作为包装图嵌入的图片单元格 %j', async (value) => {
  const workbook = makeWorkbook([{
    ...archive,
    rows: [['产品条码', 'SKU名称', '外包装图片'], [barcode, '合成商品', '']],
    cells: { C2: value },
  }]);
  const parsed = await parseProductWorkbook(workbook, { putImage: unexpectedImage });
  expect(parsed.issues).toEqual([{ sheet: archive.name, row: 2, field: '外包装图片', message: expect.stringContaining('嵌入') }]);
});

type SyntheticSheet = {
  readonly name: string;
  readonly rows: readonly (readonly (string | number | null)[])[];
  readonly isHidden?: boolean;
  readonly cells?: Readonly<Record<string, { readonly t: string; readonly v?: string | number; readonly z?: string; readonly f?: string }>>;
};

function makeWorkbook(sheets: readonly SyntheticSheet[], options?: Parameters<typeof readXlsx>[0]['options']) {
  return readXlsx({ bytes: workbookBytes(sheets), fileName: 'synthetic.xlsx', options });
}

function workbookBytes(sheets: readonly SyntheticSheet[]): Uint8Array {
  const book = xlsx.utils.book_new();
  for (const { name, rows, isHidden, cells } of sheets) {
    const sheet = xlsx.utils.aoa_to_sheet(rows);
    Object.assign(sheet, cells);
    xlsx.utils.book_append_sheet(book, sheet, name);
    if (isHidden) xlsx.utils.book_set_sheet_visibility(book, name, 1);
  }
  return xlsx.write(book, { bookType: 'xlsx', type: 'buffer' });
}

async function unexpectedImage(): Promise<never> {
  throw new Error('合成工作簿不含图片');
}
