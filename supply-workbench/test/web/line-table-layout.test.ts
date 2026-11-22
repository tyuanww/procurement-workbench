import { createRequire } from 'node:module';
import { Window } from 'happy-dom';
import { expect, it } from 'vitest';
import { makeExportLines } from '../../packages/application/src/follow-up/index.js';
import type { OrderLineRow } from '../../packages/application/src/follow-up/index.js';
import type { LineQueries } from '../../packages/application/src/ports/line-queries.js';
import { OrderLineRowSchema } from '../../packages/contracts/src/index.js';
import { spreadsheetWriter } from '../../packages/report-renderers/src/xlsx/writer.js';
import { anActor } from '../../packages/testkit/src/index.js';
import { NARROW_PHONE_MAX_WIDTH, exportAddress, lineTableLayout, readDesk, renderedLineColumns } from '../../apps/web/src/features/follow-up/index.js';
import { viewportSnapshot } from '../../apps/web/src/features/shell/model/chrome.js';
import { readViewport, shellQuery, subscribeViewport } from '../../apps/web/src/features/shell/use-viewport.js';
import { LineTable, type LineTableProps } from '../../apps/web/src/pages/lines/list/line-table.js';
import { lineMobileColumns } from '../../apps/web/src/pages/lines/list/lines-mobile.js';

const columns = readDesk('lane=finished').columns;
const now = new Date('2026-10-13T00:00:00.000Z');

it('340 去掉下一到货，341 保留，768 两侧分别是手机和桌面', async () => {
  expect(NARROW_PHONE_MAX_WIDTH).toBe(340);
  expect(shellQuery.atLeast768).toBe('(min-width: 768px)');
  const phone = viewportSnapshot({ isMax340: false, isMax1279: true, isAtLeast768: false, isMin1440: false }).band;
  const desk = viewportSnapshot({ isMax340: false, isMax1279: true, isAtLeast768: true, isMin1440: false }).band;
  expect(phone).toBe('phone');
  expect(desk).toBe('tablet');
  expect(viewportSnapshot({ isMax340: false, isMax1279: false, isAtLeast768: true, isMin1440: true }).band).toBe('wide');
  expect(lineTableLayout({ band: phone, isNarrow: true })).toBe('narrow');
  expect(lineTableLayout({ band: phone, isNarrow: false })).toBe('phone');
  expect(lineTableLayout({ band: desk, isNarrow: true })).toBe('desk');
  expect(lineTableLayout({ band: desk, isNarrow: false })).toBe('desk');
  expect(lineTableLayout({ band: 'wide', isNarrow: true })).toBe('desk');
  const narrowKeys = keysFor({ band: phone, isNarrow: true });
  const phoneKeys = keysFor({ band: phone, isNarrow: false });
  expect(narrowKeys).toEqual(['po', 'name', 'stage', 'daysInStage']);
  expect(phoneKeys).toEqual(['po', 'name', 'stage', 'nextDue', 'daysInStage']);
  expect(await headersFor(narrowKeys)).toEqual(['采购单号', '品名', '阶段', '卡了几天']);
  expect(await headersFor(phoneKeys)).toEqual(['采购单号', '品名', '阶段', '下一到货', '卡了几天']);
  const deskKeys = renderedLineColumns({ columns, hiddenKeys: ['buyer'], layout: lineTableLayout({ band: desk, isNarrow: true }) }).map((column) => column.key);
  expect(deskKeys[0]).toBe('po');
  expect(deskKeys).not.toContain('buyer');
  expect(await headersFor(deskKeys)).toContain('采购单号');
  expect(await headersFor(deskKeys)).not.toContain('负责人');
});

it('341 到 340 回调一次并改导出列，767 到 768 仍只回调一次', () => {
  expect(shellQuery.max340).toBe('(max-width: 340px)');
  const width = { value: 341 };
  const lists = new Map<string, Set<() => void>>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, writable: true, value: media(width, lists) });
  let calls = 0;
  const stop = subscribeViewport(() => { calls += 1; });
  try {
    expect(layoutNow()).toBe('phone');
    expect(exportKeys()).toEqual(['po', 'name', 'stage', 'nextDue', 'daysInStage']);
    resize({ width, lists, next: 340 });
    expect(calls).toBe(1);
    expect(readViewport(globalThis).isNarrow).toBe(true);
    expect(layoutNow()).toBe('narrow');
    expect(exportKeys()).toEqual(['po', 'name', 'stage', 'daysInStage']);
    expect(exportAddress({ query: 'lane=finished', columns: exportColumns() })).not.toContain('nextDue');
    resize({ width, lists, next: 341 });
    expect(calls).toBe(2);
    expect(layoutNow()).toBe('phone');
    expect(exportKeys()).toContain('nextDue');
    resize({ width, lists, next: 400 });
    expect(calls).toBe(2);
    resize({ width, lists, next: 767 });
    expect(calls).toBe(2);
    resize({ width, lists, next: 768 });
    expect(calls).toBe(3);
    expect(layoutNow()).toBe('desk');
    stop();
    resize({ width, lists, next: 340 });
    expect(calls).toBe(3);
  } finally {
    stop();
    if (previous === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
    else Object.defineProperty(globalThis, 'matchMedia', previous);
  }
});

it('桌面隐藏列，手机和窄屏用表格实际列且隐藏不影响手机', () => {
  const desk = renderedLineColumns({ columns, hiddenKeys: ['name', 'po'], layout: 'desk' }).map((column) => column.key);
  expect(desk[0]).toBe('po');
  expect(desk).not.toContain('name');
  expect(renderedLineColumns({ columns, hiddenKeys: ['name'], layout: 'phone' }).map((column) => column.key)).toEqual(['po', 'name', 'stage', 'nextDue', 'daysInStage']);
  expect(renderedLineColumns({ columns, hiddenKeys: ['name'], layout: 'narrow' }).map((column) => column.key)).toEqual(['po', 'name', 'stage', 'daysInStage']);
});

function layoutNow(): ReturnType<typeof lineTableLayout> {
  return lineTableLayout(readViewport(globalThis));
}

function exportColumns() {
  return renderedLineColumns({ columns, hiddenKeys: ['name'], layout: layoutNow() });
}

function exportKeys(): string[] {
  return exportColumns().map((column) => column.key);
}

function media(width: { value: number }, lists: Map<string, Set<() => void>>) {
  return (query: string) => ({
    get matches() { return matchesAt(query, width.value); },
    addEventListener(_name: string, run: () => void) {
      const set = lists.get(query) ?? new Set<() => void>();
      set.add(run);
      lists.set(query, set);
    },
    removeEventListener(_name: string, run: () => void) {
      lists.get(query)?.delete(run);
    },
  });
}

function resize(input: { readonly width: { value: number }; readonly lists: Map<string, Set<() => void>>; readonly next: number }): void {
  const before = input.width.value;
  input.width.value = input.next;
  for (const [query, set] of input.lists) {
    if (matchesAt(query, before) === matchesAt(query, input.next)) continue;
    for (const run of set) run();
  }
}

function matchesAt(query: string, width: number): boolean {
  if (query === shellQuery.max340) return width <= NARROW_PHONE_MAX_WIDTH;
  if (query === shellQuery.max1279) return width <= 1279;
  if (query === shellQuery.atLeast768) return width >= 768;
  return query === shellQuery.min1440 && width >= 1440;
}

function keysFor(input: { readonly band: string; readonly isNarrow: boolean }): string[] {
  return renderedLineColumns({
    columns,
    hiddenKeys: ['name'],
    layout: lineTableLayout(input),
  }).map((column) => column.key);
}

async function headersFor(columnKeys: readonly string[]): Promise<string[]> {
  const lines: LineQueries = {
    list: () => Promise.resolve({ items: [sampleRow()], page: { page: 1, pageSize: 1, total: 1 } }),
    summary: () => Promise.resolve({ total: 1, overdue: 0, dueToday: 0, missingDate: 0, stages: [] }),
    getDetail: () => Promise.reject(new Error('unused')),
    getBatch: () => Promise.reject(new Error('unused')),
  };
  const exported = await makeExportLines({ lines, sheets: spreadsheetWriter() })({ query: { lane: 'finished' }, hiddenKeys: [], columnKeys }, anActor('buyer'));
  return headerTexts(exported.bytes);
}

function sampleRow(): OrderLineRow {
  return OrderLineRowSchema.parse({
    id: 'line-layout',
    lane: 'finished',
    po: { id: 'po-1', poRaw: 'PO-LAYOUT', poFormat: 'NONE' },
    nameRaw: '棉片',
    itemCodeRaw: null,
    barcodeRaw: null,
    supplier: { id: null, displayName: '甲代工厂', rawName: null },
    receiver: null,
    qtyOrdered: 0,
    receivedQty: null,
    factoryDeliveredQty: { value: null, missingReason: 'no_matching_record', provenance: { kind: 'system', rule: 'fixture', at: '2026-10-01T00:00:00.000Z' } },
    stage: 'no_batch',
    nextDue: { batchId: 'batch-1', dateBuyerConfirmed: '2026-10-01', overdueDays: 3, dateFactoryRequired: null },
    daysInStage: 0,
    buyer: null,
    statusReported: null,
    missingInLatestImport: false,
    openExceptionCount: 0,
    origin: 'manual',
  });
}

function headerTexts(bytes: Uint8Array): string[] {
  const book = readBook(bytes);
  const headers: string[] = [];
  for (let column = 0; column < 20; column += 1) {
    const cell = book[`${String.fromCharCode(65 + column)}1`];
    if (!isRecord(cell) || cell.v === undefined || cell.v === '') break;
    headers.push(String(cell.v));
  }
  return headers;
}

function readBook(bytes: Uint8Array): Record<string, unknown> {
  const loaded: unknown = createRequire(new URL('../../packages/report-renderers/package.json', import.meta.url))('xlsx');
  if (!isRecord(loaded) || typeof loaded.read !== 'function') throw new Error('xlsx 没有 read');
  const book: unknown = loaded.read(bytes, { type: 'array' });
  if (!isRecord(book) || !isRecord(book.Sheets) || !isRecord(book.Sheets['订单行'])) throw new Error('xlsx 没有订单行');
  return book.Sheets['订单行'];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

it('手机表格列和同一解析结果的键与顺序相同', () => {
  const shown = renderedLineColumns({ columns, hiddenKeys: ['buyer'], layout: 'narrow' });
  const table = lineMobileColumns({ columns, shown, repeatedIdentityIds: new Set(), layout: 'narrow', now, search: '', setParams: () => undefined });
  expect(table.map((column) => column.key)).toEqual(shown.map((column) => column.key));
});

it('手机同单同名且编码或条码相同的订单行显示完整 ID，勾选也能区分', async () => {
  const sample = sampleRow();
  const rows = [
    { ...sample, id: 'line-sku-1', itemCodeRaw: 'SKU-01' },
    { ...sample, id: 'line-sku-2', itemCodeRaw: ' SKU-01 ' },
    { ...sample, id: 'line-barcode-1', barcodeRaw: '123456' },
    { ...sample, id: 'line-barcode-2', itemCodeRaw: ' ', barcodeRaw: '123456' },
    { ...sample, id: 'line-other-code', itemCodeRaw: 'SKU-02' },
    { ...sample, id: 'line-other-name', itemCodeRaw: 'SKU-01', nameRaw: '化妆棉' },
    { ...sample, id: 'line-other-po', itemCodeRaw: 'SKU-01', po: { ...sample.po, poRaw: 'PO-OTHER' } },
    sample,
  ];
  const window = new Window();
  try {
    const root = window.document.createElement('div');
    root.innerHTML = renderTableAt320({
      columns, rows, picked: [], setPicked: () => undefined, page: 1, pageSize: 20, total: rows.length,
      search: '', setParams: () => undefined, isUpdating: false, density: 'small', hiddenKeys: [], now,
    });
    const renderedRows = root.querySelectorAll('tr[data-row-key]');
    expect([...renderedRows].map((row) => row.querySelector('.line-mobile-identifier')?.textContent)).toEqual([
      expect.stringMatching(/商品编码 SKU-01\s*订单行 line-sku-1$/),
      expect.stringMatching(/商品编码 SKU-01\s*订单行 line-sku-2$/),
      expect.stringMatching(/商品编码 123456\s*订单行 line-barcode-1$/),
      expect.stringMatching(/商品编码 123456\s*订单行 line-barcode-2$/),
      '商品编码 SKU-02', '商品编码 SKU-01', '商品编码 SKU-01', '订单行 line-layout',
    ]);
    expect([...renderedRows].slice(0, 4).map((row) => row.querySelector('input[type="checkbox"]')?.getAttribute('aria-label'))).toEqual([
      expect.stringContaining('订单行 line-sku-1'), expect.stringContaining('订单行 line-sku-2'),
      expect.stringContaining('订单行 line-barcode-1'), expect.stringContaining('订单行 line-barcode-2'),
    ]);
  } finally {
    await window.happyDOM.close();
  }
});

function renderTableAt320(props: LineTableProps): string {
  const requireWeb = createRequire(new URL('../../apps/web/package.json', import.meta.url));
  const react: unknown = requireWeb('react');
  const server: unknown = requireWeb('react-dom/server');
  if (!isRecord(react) || typeof react.createElement !== 'function' || !isRecord(server) || typeof server.renderToStaticMarkup !== 'function') {
    throw new Error('web 渲染模块不齐');
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  Object.defineProperty(globalThis, 'matchMedia', { configurable: true, value: media({ value: 320 }, new Map()) });
  try {
    const html: unknown = server.renderToStaticMarkup(react.createElement(LineTable, props));
    if (typeof html !== 'string') throw new Error('没有渲染成字符串');
    return html;
  } finally {
    if (previous === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
    else Object.defineProperty(globalThis, 'matchMedia', previous);
  }
}
