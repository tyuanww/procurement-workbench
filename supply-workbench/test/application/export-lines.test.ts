import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { makeExportLines } from '../../packages/application/src/follow-up/index.js';
import type { LinesQuery, OrderLineRow } from '../../packages/application/src/follow-up/index.js';
import { templates } from '../../packages/importers/src/registry.js';
import { readXlsx } from '../../packages/importers/src/workbook/read.js';
import type { LineQueries } from '../../packages/application/src/ports/line-queries.js';
import { OrderLineRowSchema } from '../../packages/contracts/src/index.js';
import { spreadsheetWriter } from '../../packages/report-renderers/src/xlsx/writer.js';
import { anActor } from '../../packages/testkit/src/index.js';

const FINISHED_HEADERS = ['采购单号', '品名', '供应商', '工厂', '订单数量', '已收（工作台）', '代工厂已交货', '阶段', '下一到货', '卡了几天', '负责人', '总表状态'];

it('导出忽略页码，列出当前筛选的全部订单行', async () => {
  const seen: LinesQuery[] = [];
  const exported = await exportRows({ rows: [presentRow(), blankRow()], seen, query: { lane: 'finished', supplierPartyId: 'sup-a', page: 2, pageSize: 1 } });
  expect(seen[0]?.page).toBeUndefined();
  expect(seen[0]?.pageSize).toBeUndefined();
  expect(seen[0]).toMatchObject({ lane: 'finished', supplierPartyId: 'sup-a' });
  expect(texts(exported, '采购单号')).toEqual(['PO-PRESENT', 'PO-BLANK']);
});

it('表头按跟进台成品列的顺序，不写出 id 和阶段码', async () => {
  const exported = await exportRows({ rows: [presentRow(), blankRow()], seen: [], query: { lane: 'finished' } });
  expect(headersOf(exported)).toEqual(FINISHED_HEADERS);
  expect(headersOf(exported)).not.toContain('id');
  expect(headersOf(exported)).not.toContain('阶段码');
  expect(texts(exported, '阶段')).toEqual(['未建要货', '未建要货']);
  expect(valuesOf(exported)).not.toContain('no_batch');
  expect(valuesOf(exported)).not.toContain('line-present');
  expect(valuesOf(exported)).not.toContain('690123');
  expect(unrecognized(exported, 'lines.xlsx')).toEqual(templates.map(() => 0));
});

it('数量和天数保留 0，缺失格子留空而不是 0', async () => {
  const exported = await exportRows({ rows: [presentRow(), blankRow()], seen: [], query: { lane: 'finished' } });
  expect(numberAt({ bytes: exported, header: '订单数量', row: 0 })).toBe(0);
  expect(blankAt({ bytes: exported, header: '订单数量', row: 1 })).toBe(true);
  expect(numberAt({ bytes: exported, header: '已收（工作台）', row: 0 })).toBe(0);
  expect(blankAt({ bytes: exported, header: '已收（工作台）', row: 1 })).toBe(true);
  expect(numberAt({ bytes: exported, header: '代工厂已交货', row: 0 })).toBe(0);
  expect(blankAt({ bytes: exported, header: '代工厂已交货', row: 1 })).toBe(true);
  expect(numberAt({ bytes: exported, header: '卡了几天', row: 0 })).toBe(0);
  expect(texts(exported, '品名')[1]).toBe('');
  expect(noteAt({ bytes: exported, header: '品名', row: 1 })).toBe('');
  expect(blankAt({ bytes: exported, header: '总表状态', row: 1 })).toBe(true);
});

it('下一到货写成 Excel 日期，不写成显示用的字符串', async () => {
  const exported = await exportRows({ rows: [presentRow(), blankRow()], seen: [], query: { lane: 'finished' } });
  const dated = cellAt({ bytes: exported, header: '下一到货', row: 0 });
  expect(dated.t).toBe('n');
  expect(typeof dated.v).toBe('number');
  expect(dateParts(dated.v)).toEqual({ y: 2026, m: 10, d: 1 });
  expect(blankAt({ bytes: exported, header: '下一到货', row: 1 })).toBe(true);
});

it('没有命中的筛选只留下表头', async () => {
  const exported = await exportRows({ rows: [], seen: [], query: { lane: 'finished', q: '没有' } });
  expect(headersOf(exported)).toEqual(FINISHED_HEADERS);
  expect(texts(exported, '采购单号')).toEqual([]);
});

it('显式列键按传入顺序导出，未知键和线外列丢掉', async () => {
  const phone = await exportRows({ rows: [presentRow()], seen: [], query: { lane: 'finished' }, columnKeys: ['po', 'name', 'stage', 'nextDue', 'daysInStage', 'id', 'barcodeRaw'] });
  expect(headersOf(phone)).toEqual(['采购单号', '品名', '阶段', '下一到货', '卡了几天']);
  const narrow = await exportRows({ rows: [presentRow()], seen: [], query: { lane: 'finished' }, columnKeys: ['po', 'name', 'stage', 'daysInStage'] });
  expect(headersOf(narrow)).toEqual(['采购单号', '品名', '阶段', '卡了几天']);
  expect(headersOf(narrow)).not.toContain('下一到货');
  expect(valuesOf(phone)).not.toContain('690123');
  expect(valuesOf(phone)).not.toContain('line-present');
});

it('隐藏列按目录去掉，采购单号保留，未知字段不进文件', async () => {
  const exported = await exportRows({
    rows: [presentRow(), blankRow()],
    seen: [],
    query: { lane: 'finished' },
    hiddenKeys: ['factory', 'buyer', 'status', 'po', 'id', 'barcodeRaw', 'itemCodeRaw'],
  });
  expect(headersOf(exported)).toEqual(['采购单号', '品名', '供应商', '订单数量', '已收（工作台）', '代工厂已交货', '阶段', '下一到货', '卡了几天']);
  expect(valuesOf(exported)).not.toContain('690123');
  expect(valuesOf(exported)).not.toContain('ITEM-1');
});

async function exportRows(input: { readonly rows: readonly OrderLineRow[]; readonly seen: LinesQuery[]; readonly query: LinesQuery; readonly hiddenKeys?: readonly string[]; readonly columnKeys?: readonly string[] }): Promise<Uint8Array> {
  const exported = await makeExportLines({ lines: linesOf(input.rows, input.seen), sheets: spreadsheetWriter() })({ query: input.query, hiddenKeys: input.hiddenKeys ?? [], columnKeys: input.columnKeys ?? [] }, anActor('buyer'));
  return exported.bytes;
}

function linesOf(rows: readonly OrderLineRow[], seen: LinesQuery[]): LineQueries {
  return {
    list: (query) => {
      seen.push(query);
      const items = query.pageSize === undefined ? rows : rows.slice(0, query.pageSize);
      return Promise.resolve({ items, page: { page: query.page ?? 1, pageSize: items.length, total: rows.length } });
    },
    summary: () => Promise.resolve({ total: rows.length, overdue: 0, dueToday: 0, missingDate: 0, stages: [] }),
    getDetail: () => Promise.reject(new Error('unused')),
    getBatch: () => Promise.reject(new Error('unused')),
  };
}

function presentRow(): OrderLineRow {
  return lineRow({
    id: 'line-present',
    poRaw: 'PO-PRESENT',
    nameRaw: '棉片',
    barcodeRaw: '690123',
    itemCodeRaw: 'ITEM-1',
    supplierName: '甲代工厂',
    qtyOrdered: 0,
    receivedQty: 0,
    delivered: 0,
    daysInStage: 0,
    due: '2026-10-01',
    statusReported: '',
  });
}

function blankRow(): OrderLineRow {
  return lineRow({
    id: 'line-blank',
    poRaw: 'PO-BLANK',
    nameRaw: '',
    barcodeRaw: '690999',
    itemCodeRaw: 'ITEM-2',
    supplierName: null,
    qtyOrdered: null,
    receivedQty: null,
    delivered: null,
    daysInStage: 3,
    due: null,
    statusReported: null,
  });
}

function lineRow(input: {
  readonly id: string;
  readonly poRaw: string;
  readonly nameRaw: string | null;
  readonly barcodeRaw: string;
  readonly itemCodeRaw: string;
  readonly supplierName: string | null;
  readonly qtyOrdered: number | null;
  readonly receivedQty: number | null;
  readonly delivered: number | null;
  readonly daysInStage: number;
  readonly due: string | null;
  readonly statusReported: string | null;
}): OrderLineRow {
  return OrderLineRowSchema.parse({
    id: input.id,
    lane: 'finished',
    po: { id: 'po-1', poRaw: input.poRaw, poFormat: 'NONE' },
    nameRaw: input.nameRaw,
    itemCodeRaw: input.itemCodeRaw,
    barcodeRaw: input.barcodeRaw,
    supplier: { id: null, displayName: input.supplierName, rawName: null },
    receiver: null,
    qtyOrdered: input.qtyOrdered,
    receivedQty: input.receivedQty,
    factoryDeliveredQty: input.delivered === null
      ? { value: null, missingReason: 'no_matching_record', provenance: { kind: 'system', rule: 'fixture', at: '2026-10-01T00:00:00.000Z' } }
      : { value: input.delivered, provenance: { kind: 'system', rule: 'fixture', at: '2026-10-01T00:00:00.000Z' } },
    stage: 'no_batch',
    nextDue: input.due === null ? null : { batchId: 'batch-1', dateBuyerConfirmed: input.due, overdueDays: null, dateFactoryRequired: null },
    daysInStage: input.daysInStage,
    buyer: null,
    statusReported: input.statusReported,
    missingInLatestImport: false,
    openExceptionCount: 0,
    origin: 'manual',
  });
}

function unrecognized(bytes: Uint8Array, fileName: string): number[] {
  const book = readXlsx({ bytes, fileName });
  return templates.map((template) => template.detect(book).score);
}

function headersOf(bytes: Uint8Array): string[] {
  return textsInRow(bytes, 0);
}

function texts(bytes: Uint8Array, header: string): string[] {
  return columnCells(bytes, header).map((cell) => cell.v === undefined ? '' : String(cell.v));
}

function valuesOf(bytes: Uint8Array): unknown[] {
  const sheet = readSheet(bytes);
  return Object.entries(sheet).flatMap(([key, cell]) => key.startsWith('!') || !isRecord(cell) ? [] : [cell.v]);
}

type Spot = { readonly bytes: Uint8Array; readonly header: string; readonly row: number };

function numberAt(spot: Spot): unknown {
  const cell = cellAt(spot);
  expect(cell.t).toBe('n');
  return cell.v;
}

function blankAt(spot: Spot): boolean {
  const cell = cellAt(spot);
  return cell.v !== 0 && cell.v !== '0' && (cell.v === '' || cell.v === undefined) && cell.note.includes('不是 0');
}

function noteAt(spot: Spot): string {
  return cellAt(spot).note;
}

function cellAt(spot: Spot): ReadCell {
  const cell = columnCells(spot.bytes, spot.header)[spot.row];
  if (cell === undefined) throw new Error(`没有单元格 ${spot.header} ${spot.row + 1}`);
  return cell;
}

function columnCells(bytes: Uint8Array, header: string): ReadCell[] {
  const index = headersOf(bytes).indexOf(header);
  if (index < 0) throw new Error(`没有列 ${header}`);
  const cells: ReadCell[] = [];
  for (let row = 1; row < rowCount(bytes); row += 1) {
    cells.push(cellOf({ bytes, row, column: index }) ?? { t: 's', v: '', z: undefined, note: '' });
  }
  return cells;
}

function textsInRow(bytes: Uint8Array, row: number): string[] {
  const textsInHeader: string[] = [];
  for (let column = 0; column < columnCount(bytes); column += 1) {
    const cell = cellOf({ bytes, row, column });
    textsInHeader.push(cell === undefined || cell.v === undefined ? '' : String(cell.v));
  }
  return textsInHeader;
}

function rowCount(bytes: Uint8Array): number {
  return rangeOf(bytes).rows;
}

function columnCount(bytes: Uint8Array): number {
  return rangeOf(bytes).columns;
}

function rangeOf(bytes: Uint8Array): { readonly rows: number; readonly columns: number } {
  const ref = readSheet(bytes)['!ref'];
  if (typeof ref !== 'string') return { rows: 0, columns: 0 };
  const matched = /^[A-Z]+(\d+):([A-Z]+)(\d+)$/.exec(ref);
  if (matched === null) return { rows: 1, columns: 1 };
  const endColumn = matched[2];
  const endRow = matched[3];
  if (endColumn === undefined || endRow === undefined) return { rows: 1, columns: 1 };
  return { rows: Number(endRow), columns: columnIndex(endColumn) + 1 };
}

function columnIndex(letters: string): number {
  return [...letters].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function cellOf(input: { readonly bytes: Uint8Array; readonly row: number; readonly column: number }): ReadCell | undefined {
  return readCell(input.bytes, `${columnLetters(input.column)}${input.row + 1}`);
}

function columnLetters(index: number): string {
  const letter = String.fromCharCode(65 + index);
  if (index < 26) return letter;
  throw new Error(`列号超出范围 ${index}`);
}

type ReadCell = { readonly t: unknown; readonly v: unknown; readonly z: unknown; readonly note: string };

function readCell(bytes: Uint8Array, key: string): ReadCell | undefined {
  const cell = readSheet(bytes)[key];
  if (!isRecord(cell)) return undefined;
  return { t: cell.t, v: cell.v, z: cell.z, note: noteOf(cell.c) };
}

function noteOf(value: unknown): string {
  if (!Array.isArray(value)) return '';
  const first = value[0];
  if (!isRecord(first) || typeof first.t !== 'string') return '';
  return first.t;
}

function dateParts(value: unknown): { readonly y: number; readonly m: number; readonly d: number } | undefined {
  if (typeof value !== 'number') return undefined;
  const parsed: unknown = ssf().parse_date_code(value);
  if (!isRecord(parsed) || typeof parsed.y !== 'number' || typeof parsed.m !== 'number' || typeof parsed.d !== 'number') return undefined;
  return { y: parsed.y, m: parsed.m, d: parsed.d };
}

function ssf(): { parse_date_code(value: number): unknown } {
  const loaded: unknown = createRequire(new URL('../../packages/report-renderers/package.json', import.meta.url))('xlsx');
  if (!isRecord(loaded)) throw new Error('xlsx 没有日期解码');
  const format = loaded.SSF;
  if (!isRecord(format) || !isCallable(format.parse_date_code)) throw new Error('xlsx 没有日期解码');
  const parse = format.parse_date_code;
  return { parse_date_code: (value) => parse(value) };
}

function readSheet(bytes: Uint8Array): Record<string, unknown> {
  const book = callRead(bytes);
  if (!isRecord(book) || !isRecord(book.Sheets)) throw new Error('xlsx 没有工作簿');
  const sheet = book.Sheets['订单行'];
  if (!isRecord(sheet)) throw new Error('xlsx 没有订单行');
  return sheet;
}

function callRead(bytes: Uint8Array): unknown {
  const loaded: unknown = createRequire(new URL('../../packages/report-renderers/package.json', import.meta.url))('xlsx');
  if (!isRecord(loaded) || !isCallable(loaded.read)) throw new Error('xlsx 没有 read');
  return loaded.read(bytes, { type: 'array' });
}

function isCallable(value: unknown): value is (...args: readonly unknown[]) => unknown {
  return typeof value === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
