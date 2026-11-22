import type { OrderLineDetail, OrderLineRow, ProcurementStore } from '@sw/contracts';
import { createRequire } from 'node:module';
import { expect } from 'vitest';

const XLSX = createRequire(new URL('../../../../packages/importers/package.json', import.meta.url))('xlsx');
const PROJECT = '店铺甲项目进度表';
const CAP = '99010003';

type Upload = { readonly id: string; readonly revision: number };
type ProcurementStoreTestApi = {
  upload(name: string, bytes: Buffer): Promise<Upload>;
  commit(batch: Upload): Promise<{ readonly statusCode: number }>;
  scopedLines(store: ProcurementStore): Promise<readonly OrderLineRow[]>;
  detail(lineId: string, store?: ProcurementStore): Promise<OrderLineDetail>;
};

export async function verifyStoreIsolation(api: ProcurementStoreTestApi, original: Buffer) {
  const initial = await api.scopedLines('store_a');
  const expectedShared = initial.find((line) => line.storeProgress?.materials.some((item) => item.codeRaw === CAP));
  const component = required(expectedShared?.storeProgress?.materials.find((item) => item.codeRaw === CAP));
  const batch = await api.upload('store_b.xlsx', store_bSheet(original));
  expect((await api.commit(batch)).statusCode).toBe(200);

  const [store_a, store_b, unassigned] = await Promise.all([
    api.scopedLines('store_a'), api.scopedLines('store_b'), api.scopedLines('unassigned'),
  ]);
  expect(store_a.some((line) => line.id === expectedShared?.id)).toBe(true);
  const other = required(store_b[0]);
  expect(store_b).toHaveLength(1);
  expect(other).toMatchObject({
    po: { poRaw: 'PO20261117009001' },
    storeProgress: {
      sources: [expect.objectContaining({ oaRaw: 'XPKA(CN)9910', rowNo: 7 })],
      materials: [expect.objectContaining({ id: component.id, source: expect.objectContaining({ sheetName: '店铺乙项目进度表' }) })],
    },
  });
  expect(unassigned.map((line) => line.nameRaw)).toContain('测试无 OA 成品');
  expect(unassigned.map((line) => line.nameRaw)).toContain('测试归档成品');
  expect((await api.detail(component.id, 'store_b')).procurement?.relatedLines.map((line) => line.id)).toEqual([other.id]);
  expect((await api.detail(component.id, 'store_b')).procurement?.sources.map((entry) => entry.fact.source.sheetName)).toEqual(['店铺乙项目进度表']);
}

function store_bSheet(originalFile: Buffer): Buffer {
  const book = XLSX.read(originalFile);
  const masterName = '采购订单总表';
  const master = book.Sheets[masterName];
  const original = book.Sheets[PROJECT];
  const projectName = '店铺乙项目进度表';
  const masterRows = XLSX.utils.sheet_to_json(master, { header: 1 });
  const projectRows = XLSX.utils.sheet_to_json(original, { header: 1 });
  const oa = 'XPKA(CN)9910';
  const barcode = '9900000000009';
  const finished = [...masterRows[1]];
  finished[0] = oa;
  finished[2] = '店铺乙验证成品';
  finished[3] = barcode;
  XLSX.utils.sheet_add_aoa(master, [finished], { origin: 'A7' });
  const material = [...projectRows[4]];
  material[0] = oa;
  material[2] = barcode;
  book.Sheets[projectName] = XLSX.utils.aoa_to_sheet([projectRows[0], projectRows[1], material]);
  book.SheetNames = [masterName, projectName];
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('找不到预期的店铺采购记录');
  return value;
}
