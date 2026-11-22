import { expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import type { TodoItemView } from '../../packages/contracts/src/index.js';
import { todayBoard } from '../../apps/web/src/features/today/index.js';
import type { BoardItem } from '../../apps/web/src/features/today/model/types.js';
import { actionPageSearch, actionQuery } from '../../apps/web/src/pages/today/action-query.js';
import { applyNextToday, loadToday } from '../../apps/web/src/pages/today/today-load.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';

import { pagedToday } from './today-page-fixture.js';

const BUYER = '0199f0a0-0000-7000-8000-000000000002';

it('改确认日之后看板等于下一次今日结果', async () => {
  const body = todayBody(confirmedItem());
  const confirmed = await boardAfter(pagedToday(body));
  expect(confirmed).toContain('登记发货');
  const missing = await boardAfter(pagedToday({ ...body, items: [] }));
  expect(missing).not.toContain('登记发货');
});

it('保存成功后今日没读出来时关闭已提交表单并保留原来的行', async () => {
  emptyReads();
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('down'); };
  const seen = { notice: '', isReplaced: false, isClosed: false };
  try {
    const isRefreshed = await applyNextToday({
      refresh: async () => {
        await loadToday();
        seen.isReplaced = true;
        return true;
      },
      close: () => { seen.isClosed = true; },
      setNotice: (notice) => { seen.notice = notice; },
    });
    expect(isRefreshed).toBe(false);
    expect(seen.notice).toBe('网络没有连上。检查登录或网络后重试。');
    expect(seen.isClosed).toBe(true);
    expect(seen.isReplaced).toBe(false);
  } finally {
    globalThis.fetch = previous;
  }
});

async function boardAfter(body: unknown): Promise<string> {
  emptyReads();
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/api/v1/me')) return Response.json({ id: BUYER, name: '采购甲', roles: ['buyer'], devLogin: true });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('page')).toBe('3');
    expect(params.get('sort')).toBe('bulk');
    expect(params.get('unit')).toBe('件');
    expect(params.get('reasons')).toBe('missing_date,due_today');
    return Response.json(body);
  };
  const held: { items: readonly BoardItem[] } = { items: [] };
  const query = actionPageSearch(actionQuery('page=3&reasons=missing_confirmed,due_today&sort=bulk&unit=件'));
  try {
    const isRefreshed = await applyNextToday({
      refresh: async () => {
        held.items = (await loadToday(query)).items;
        return true;
      },
      setNotice: () => undefined,
    });
    expect(isRefreshed).toBe(true);
    return labelsOf(held.items);
  } finally {
    globalThis.fetch = previous;
  }
}

function labelsOf(items: readonly BoardItem[]): string {
  const board = todayBoard({ items, reasons: [], group: null, buyerName: '采购甲' });
  if (board.body.kind !== 'groups') return '';
  return board.body.rows.flatMap((row) => row.actions.map((action) => action.label)).join(' ');
}

function confirmedItem(): TodoItemView {
  return {
    id: 'todo-1',
    subject: 'batch',
    reasons: ['due_today'],
    severity: 2,
    ownerUserId: BUYER,
    waitingOn: { kind: 'internal', partyId: null },
    dueDate: localDate('2026-10-12'),
    overdueDays: null,
    refs: { orderLineId: 'line-1', batchId: 'batch-1' },
    line: {
      id: 'line-1',
      lane: 'finished',
      poRaw: 'PO1',
      poFormat: 'NONE',
      nameRaw: '面膜',
      itemCodeRaw: null,
      barcodeRaw: null,
      buyerName: '采购甲',
    },
    batch: {
      id: 'batch-1',
      seq: 1,
      plannedQty: 10,
      status: 'confirmed',
      noteStatus: 'missing',
      dateBuyerConfirmed: localDate('2026-10-12'),
      firstConfirmedDate: localDate('2026-10-12'),
      dateFactoryRequired: null,
      dateSupplierPromised: null,
      shippedQty: 0,
      receivedQty: 0,
      lastShippedOn: null,
    },
    waitingOnParty: null,
    exception: null,
  };
}

function todayBody(row: TodoItemView) {
  return {
    asOf: '2026-11-03',
    counts: {
      overdue: 0,
      demand_before_confirmed: 0,
      due_today: 1,
      missing_date: 0,
      shipped_not_received: 0,
      unshipped: 0,
      fulfillment_review: 0,
      follow_up_due: 0,
      follow_up_scheduled: 0,
      note_missing: 0,
      upcoming: 0,
      exception_open: 0,
      review_pending: 0,
      import_pending: 0,
      unassigned: 0,
    },
    items: [row],
    arrivalMemos: [],
    truncated: false,
  };
}
