import { expect, it } from 'vitest';
import type { WorkbookLike } from '../../packages/application/src/ports/workbook-reader.js';
import { REQUIRED_COLUMNS } from '../../packages/importers/src/templates/po-master-v1/columns.js';
import { template } from '../../packages/importers/src/templates/po-master-v1/index.js';
import { buildSheet, cellKey, type CellDraft, type MergeRange } from '../../packages/importers/src/workbook/sheet.js';

const context = { uploadedAt: '2026-10-12T00:00:00.000Z', factoryPartyId: null };
const masterName = '采购订单总表';
const activeName = '示例项目进度表';
const completedName = '已完结订单情况';
const water = '6900000000001';
const lotion = '6900000000002-2';
const cream = '6900000000003';
const mergedOa = ' XPKA(CN)0110-4 \n';
const mergedCodes = `${water}；\n${lotion}`;
const multipleOa = 'XPKA（CN）0110-4-1；\n XPKA(CN)0111-1';
const multiplePo = 'PO20260101000015；PO20260101000016-20';

const master = sheet({ name: masterName, rows: [
  REQUIRED_COLUMNS,
  masterRow(['XPKA(CN)0110', '示例水', water, 'PO20260101000001']),
  masterRow(['XPKA(CN)0110', '示例乳', lotion, 'PO20260101000001']),
  masterRow(['XPKA(CN)0111', '示例乳', lotion, 'PO20260101000002']),
  masterRow([null, '示例乳', lotion, 'PO20260101000003']),
  masterRow(['XPKA(CN)0110', '未改版示例乳', '6900000000002', 'PO20260101000004']),
  masterRow(['XPKA(CN)0120', '示例霜', cream, 'PO20260101000005']),
  masterRow(['XPKA(CN)0120', '示例霜', cream, 'PO20260101000006']),
] });

const componentHeaders = ['OA需求流程编号', '产品69码', '需采购子件名称', '子部件代码', '对应采购员', '供应商', '采购订单PO单号', '采购数量', '采购单位'];
const active = sheet({ name: activeName, rows: [
  ['说明'], componentHeaders,
  [mergedOa, mergedCodes, '水乳共用盖子', 'PART-001', '采购甲', '供应商甲', multiplePo, '20万 个'],
  [null, null, '示例水-花盒', 'PART-002', null, '供应商乙', 'PO20260101000018', 100000, '个'],
  [null, null, null, 'PART-003'],
  [multipleOa, lotion, '两笔OA共用瓶身', 'PART-004'],
  ['XPKA(CN)0120-1', cream, '需核对订单行', 'PART-005', null, null, null, '待确认'],
  ['XPKA(CN)0120-1', cream, '已标明采购订单', 'PART-006', null, null, 'PO20260101000006', 10000],
  [null, null, null, null],
], merges: [
  { r1: 3, r2: 5, c1: 1, c2: 1 },
  { r1: 3, r2: 5, c1: 2, c2: 2 },
  { r1: 8, r2: 9, c1: 7, c2: 7 },
] });

const archive = sheet({ name: completedName, rows: [
  componentHeaders,
  ['XPKA(CN)0110-4', water, '示例水-完结事项', 'PART-007', null, null, null, 1],
] });

it('工作簿保留共用子件、来源合并范围、OA 及采购单原文，归档与现行同图可查', () => {
  const parsed = template.parse(workbook([active, master, archive]), context);
  const preview = parsed.procurement;
  if (preview === undefined) throw new Error('应识别采购关联工作表');

  expect(template.detect(workbook([active, master, archive])).score).toBe(100);
  expect(preview.finishedRows).toHaveLength(7);
  expect(preview.componentFacts).toHaveLength(7);
  const cap = preview.componentFacts.filter((fact) => fact.componentCodeRaw === 'PART-001');
  expect(cap).toHaveLength(1);
  expect(cap[0]).toMatchObject({
    source: { sheetName: activeName, rowNo: 3 }, status: 'active',
    componentNameRaw: '水乳共用盖子', quantityRaw: '20万 个', quantity: 200000, unitRaw: '个',
    poRaw: multiplePo, supplierRaw: '供应商甲', buyerRaw: '采购甲',
  });
  expect(linkRows(preview.links, [activeName, 3])).toEqual([[2, 'shared'], [3, 'shared'], [4, 'candidate'], [5, 'candidate']]);
  expect(linkRows(preview.links, [activeName, 4])).toEqual([[2, 'direct']]);
  expect(preview.componentFacts.find((fact) => fact.componentCodeRaw === 'PART-003')).toMatchObject({
    componentNameRaw: null, poRaw: null, buyerRaw: null, supplierRaw: null, quantity: null, unitRaw: null,
    oa: { raw: mergedOa, refs: [{ raw: 'XPKA(CN)0110-4', main: 'XPKA(CN)0110' }], source: mergedCell(1) },
    productCodes: { raw: mergedCodes, source: mergedCell(2) },
  });
  expect(preview.componentFacts.find((fact) => fact.componentCodeRaw === 'PART-004')?.oa).toMatchObject({
    raw: multipleOa,
    refs: [{ raw: 'XPKA（CN）0110-4-1', main: 'XPKA(CN)0110' }, { raw: 'XPKA(CN)0111-1', main: 'XPKA(CN)0111' }],
  });
  expect(linkRows(preview.links, [activeName, 6])).toEqual([[3, 'shared'], [4, 'shared'], [5, 'candidate']]);
  expect(preview.componentFacts.at(-1)).toMatchObject({ status: 'completed', source: { sheetName: completedName, rowNo: 2 }, unitRaw: null });
  expect(linkRows(preview.links, [completedName, 2])).toEqual([[2, 'direct']]);
});

it('缺少 OA 或总表 PO 证据时保留候选，成品编码后缀不参与模糊匹配', () => {
  const preview = template.parse(workbook([master, active, archive]), context).procurement;
  if (preview === undefined) throw new Error('应识别采购关联工作表');

  expect(preview.finishedRows.find((row) => row.source.rowNo === 5)).toMatchObject({ oaRaw: null, oaRefs: [], productCodeRaw: lotion });
  expect(preview.links.some((item) => item.finishedRow.rowNo === 6)).toBe(false);
  expect(linkRows(preview.links, [activeName, 7])).toEqual([[7, 'candidate'], [8, 'candidate']]);
  expect(linkRows(preview.links, [activeName, 8])).toEqual([[8, 'direct']]);
  expect(preview.componentFacts.find((fact) => fact.componentCodeRaw === 'PART-005')).toMatchObject({ quantityRaw: '待确认', quantity: null });
});

it('仅有商品码的子件表能提供候选，单页和 CSV 仍使用原总表行', () => {
  const withoutOa = sheet({ name: activeName, rows: [['产品69码', '子部件代码', '采购数量'], [water, 'PART-008', 5]] });
  const single = template.parse(workbook([master]), context);
  const csv = template.parse({ ...workbook([master]), source: { kind: 'csv', fileName: 'example.csv' } }, context);
  const multiple = template.parse(workbook([master, withoutOa]), context);

  expect(single.procurement).toBeUndefined();
  expect(csv).toEqual(single);
  expect(multiple.rows).toEqual(single.rows);
  expect(multiple.procurement?.componentFacts[0]).toMatchObject({ oa: { raw: null, refs: [], source: null }, quantity: 5 });
  expect(linkRows(multiple.procurement?.links ?? [], [activeName, 2])).toEqual([[2, 'candidate']]);
});

function workbook(sheets: WorkbookLike['sheets']): WorkbookLike {
  return { source: { kind: 'xlsx', fileName: 'example.xlsx' }, date1904: false, sheets };
}

function sheet({ name, rows, merges = [] }: { readonly name: string; readonly rows: readonly (readonly (string | number | null)[])[]; readonly merges?: readonly MergeRange[] }): WorkbookLike['sheets'][number] {
  const cells = new Map<string, CellDraft>();
  for (const [rowNo, row] of rows.entries()) {
    for (const [column, value] of row.entries()) {
      if (value === null) continue;
      const kind = typeof value === 'number' ? 'number' : 'string';
      cells.set(cellKey(rowNo + 1, column + 1), { kind, value, text: String(value) });
    }
  }
  return buildSheet({ name, cells, merges, hidden: false });
}

function masterRow([oa, name, code, po]: [string | null, string, string, string]): (string | number | null)[] {
  return [oa, '供应商甲', name, code, 100000, null, null, null, po];
}

function mergedCell(column: number) {
  return { sheetName: activeName, rowNo: 3, column, range: { startRow: 3, endRow: 5, startColumn: column, endColumn: column } };
}

function linkRows(links: NonNullable<ReturnType<typeof template.parse>['procurement']>['links'], [sheetName, rowNo]: [string, number]) {
  return links.filter((link) => link.component.sheetName === sheetName && link.component.rowNo === rowNo)
    .map((link) => [link.finishedRow.rowNo, link.kind]);
}

it('只从唯一 OA 和完整商品码采集项目日期，并按合并锚点去重', () => {
  const project = sheet({ name: activeName, rows: [
    [...componentHeaders, '需求下发时间', '需求交付日期', '下单日期'],
    ['XPKA(CN)0110', water, '测试子件', 'A1', null, null, null, null, null, '2026/4/22', '2026/6/14', '2026/4/25'],
    [null, null, '测试子件2', 'A2'],
    ['XPKA(CN)0120', cream, '同 OA 同码有两成品行', 'A3', null, null, null, null, null, '2026/5/1'],
    [null, water, '仅有商品码', 'A4', null, null, null, null, null, '2026/5/1'],
    ['XPKA(CN)0111', lotion, '真缺年', 'A5', null, null, null, null, null, '4月22日'],
  ], merges: [1, 2, 10, 11, 12].map((col) => ({ r1: 2, r2: 3, c1: col, c2: col })) });
  const parsed = template.parse(workbook([master, project]), context);
  const [first, , third] = parsed.rows;
  expect(first?.payload.projectDates).toMatchObject([
    { field: 'releasedOn', value: '2026-04-22', source: { rowNo: 2, column: 10, range: { startRow: 2, endRow: 3 } } },
    { field: 'projectOrderedOn', value: '2026-04-25', source: { rowNo: 2, column: 12 } },
    { field: 'projectTargetOn', value: '2026-06-14', source: { rowNo: 2, column: 11 } },
  ]);
  expect(third?.payload.projectDates).toMatchObject([{ field: 'releasedOn', raw: '4月22日', value: null }]);
  expect(parsed.rows.slice(-2).every((row) => row.payload.projectDates === undefined)).toBe(true);
});

it('同一 OA 的共用子件行可为两款已明确列码的成品提供排期日期', () => {
  const project = sheet({ name: activeName, rows: [
    [...componentHeaders, '需求下发时间'],
    [mergedOa, mergedCodes, '水乳共用盖子', 'A1', null, null, null, null, null, '2026/4/22'],
    [multipleOa, mergedCodes, '多个 OA 的组合日期待核', 'A2', null, null, null, null, null, '2026/5/1'],
  ] });
  const { rows } = template.parse(workbook([master, project]), context);
  const expected = [{ field: 'releasedOn', value: '2026-04-22', source: { rowNo: 2 } }];
  expect(rows[0]?.payload.projectDates).toMatchObject(expected);
  expect(rows[1]?.payload.projectDates).toMatchObject(expected);
  expect(rows.slice(2).every((row) => row.payload.projectDates === undefined)).toBe(true);
});

it('其他子件确认关联后仍保留仅商品码匹配的候选', () => {
  const project = sheet({ name: activeName, rows: [
    componentHeaders,
    ['XPKA(CN)0110', water, '盖子', 'A1', null, null, 'PO20260101000001', 100],
    [null, water, '泵头', 'A2', null, null, 'PO20260101000001', 200],
  ] });
  const preview = template.parse(workbook([master, project]), context).procurement;
  expect(preview?.componentFacts.map((fact) => fact.componentCodeRaw)).toEqual(['A1', 'A2']);
  expect(linkRows(preview?.links ?? [], [activeName, 2])).toEqual([[2, 'direct']]);
  expect(linkRows(preview?.links ?? [], [activeName, 3])).toEqual([[2, 'candidate']]);
});

it('成品名称内的 & 不改变唯一成品关联', () => {
  const single = sheet({ name: masterName, rows: [
    REQUIRED_COLUMNS,
    masterRow(['XPKA(CN)0110', '名称A&B', water, 'PO20260101000001']),
    masterRow(['XPKA(CN)0110', '产品乙', lotion, 'PO20260101000002']),
  ] });
  const project = sheet({ name: activeName, rows: [
    componentHeaders,
    ['XPKA(CN)0110', mergedCodes, '名称A&B-盖子', 'A1', null, null, 'PO20260101000001', 100],
  ] });
  const preview = template.parse(workbook([single, project]), context).procurement;
  expect(linkRows(preview?.links ?? [], [activeName, 2])).toEqual([[2, 'direct']]);
});

it('数量单位冲突时保留原文并标待核对', () => {
  const project = sheet({ name: activeName, rows: [
    componentHeaders,
    ['XPKA(CN)0110', water, '盖子', 'A1', null, null, 'PO20260101000001', '20万 个', '箱'],
    ['XPKA(CN)0110', water, '泵头', 'A2', null, null, 'PO20260101000001', '3 kg', 'ＫＧ'],
  ] });
  const preview = template.parse(workbook([master, project]), context).procurement;
  expect(preview?.componentFacts).toMatchObject([
    { quantityRaw: '20万 个', quantity: null, unitRaw: '箱', quantityUnitConflict: true },
    { quantityRaw: '3 kg', quantity: 3, unitRaw: 'ＫＧ' },
  ]);
});
