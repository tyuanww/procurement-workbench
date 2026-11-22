import { expect, it } from 'vitest';
import { OrderLineRowSchema, type OrderLineRow } from '../../packages/contracts/src/index.js';
import { lineCell, readDesk } from '../../apps/web/src/features/follow-up/index.js';
import { createListGate, hintBatches, loadDeskList } from '../../apps/web/src/pages/lines/list/LineListPage.js';

const LINE_ID = 'line-1';

it('生成批次后句子还在，默认跟进台的阶段是待确认日期', async () => {
  const restore = installFetch();
  try {
    const desk = blankDesk();
    await hintBatches({
      lineIds: [LINE_ID],
      query: readDesk('').requestQuery,
      gate: createListGate(),
      setRows: desk.setRows,
      setTotal: desk.setTotal,
      setMessage: desk.setMessage,
      setSkips: desk.setSkips,
    });
    expect(desk.message).toBe('新建 1 个批次');
    expect(desk.skips).toEqual([]);
    expect(desk.total).toBe(1);
    expect(stageText(desk.rows[0])).toBe('待确认日期');
  } finally {
    restore();
  }
});

it('未建要货筛掉新建批次的行，句子仍在', async () => {
  const restore = installFetch();
  try {
    const desk = blankDesk();
    await hintBatches({
      lineIds: [LINE_ID],
      query: readDesk('stage=no_batch').requestQuery,
      gate: createListGate(),
      setRows: desk.setRows,
      setTotal: desk.setTotal,
      setMessage: desk.setMessage,
      setSkips: desk.setSkips,
    });
    expect(desk.message).toBe('新建 1 个批次');
    expect(desk.total).toBe(0);
    expect(desk.rows.map((row) => row.id)).not.toContain(LINE_ID);
  } finally {
    restore();
  }
});

it('更早的列表响应不盖住生成批次后的阶段', async () => {
  const gate = createListGate();
  let releaseStale: (body: unknown) => void = () => undefined;
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    if (url.includes('/hint-batches')) return jsonBody({ created: 1, skipped: [] });
    if (url.includes('stale=1')) return new Promise((resolve) => { releaseStale = (body) => resolve(jsonBody(body)); });
    return jsonBody(pageOf([lineRow('awaiting_date')]));
  };
  try {
    const desk = blankDesk();
    const stale = loadDeskList({
      query: 'stale=1',
      gate,
      setRows: desk.setRows,
      setTotal: desk.setTotal,
    });
    await hintBatches({
      lineIds: [LINE_ID],
      query: readDesk('').requestQuery,
      gate,
      setRows: desk.setRows,
      setTotal: desk.setTotal,
      setMessage: desk.setMessage,
      setSkips: desk.setSkips,
    });
    expect(desk.message).toBe('新建 1 个批次');
    expect(stageText(desk.rows[0])).toBe('待确认日期');
    releaseStale(pageOf([lineRow('no_batch')]));
    await stale;
    expect(desk.message).toBe('新建 1 个批次');
    expect(stageText(desk.rows[0])).toBe('待确认日期');
  } finally {
    globalThis.fetch = previous;
  }
});

function stageText(row: OrderLineRow | undefined): string {
  if (row === undefined) throw new Error('跟进台没有这一行');
  const cell = lineCell({ column: 'stage', row, now: new Date('2026-11-03T00:00:00+08:00') });
  if (cell.kind !== 'text') throw new Error('阶段不是文字');
  return cell.text;
}

function blankDesk() {
  const state: { message: string; rows: OrderLineRow[]; total: number; skips: readonly string[] } = {
    message: '',
    rows: [],
    total: -1,
    skips: [],
  };
  return {
    get message() { return state.message; },
    get rows() { return state.rows; },
    get total() { return state.total; },
    get skips() { return state.skips; },
    setMessage: (message: string) => { state.message = message; },
    setRows: (rows: readonly OrderLineRow[]) => { state.rows = [...rows]; },
    setTotal: (total: number) => { state.total = total; },
    setSkips: (skips: readonly string[]) => { state.skips = skips; },
  };
}

function installFetch(): () => void {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = requestUrl(input);
    if (url.includes('/hint-batches')) return jsonBody({ created: 1, skipped: [] });
    if (url.includes('stages=no_batch')) return jsonBody(pageOf([]));
    return jsonBody(pageOf([lineRow()]));
  };
  return () => { globalThis.fetch = previous; };
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function jsonBody(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function pageOf(items: readonly unknown[]) {
  return { items, page: { page: 1, pageSize: 200, total: items.length } };
}

function lineRow(stage: 'awaiting_date' | 'no_batch' = 'awaiting_date') {
  return OrderLineRowSchema.parse({
    id: LINE_ID,
    lane: 'finished',
    po: { id: 'po-1', poRaw: 'PO1', poFormat: 'NONE' },
    nameRaw: '面膜',
    itemCodeRaw: null,
    barcodeRaw: null,
    supplier: { id: null, displayName: '甲代工厂', rawName: null },
    receiver: null,
    qtyOrdered: 10,
    receivedQty: 0,
    factoryDeliveredQty: { value: null, missingReason: 'no_matching_record', provenance: { kind: 'system', rule: 'fixture', at: '2026-10-01T00:00:00.000Z' } },
    stage,
    nextDue: null,
    daysInStage: 0,
    buyer: null,
    statusReported: null,
    missingInLatestImport: false,
    openExceptionCount: 0,
    origin: 'manual',
  });
}
