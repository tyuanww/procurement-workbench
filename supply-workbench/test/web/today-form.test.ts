import { expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import { CreateReceiptRequestSchema, CreateShipmentRequestSchema, type TodoItemView } from '../../packages/contracts/src/index.js';
import { postReceipt, postShipment } from '../../apps/web/src/features/follow-up/record-forms/commands.js';
import { loadToday } from '../../apps/web/src/pages/today/today-load.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';
import { businessTimeZone, setBusinessTimeZone } from '../../apps/web/src/shared/business-time-zone.js';
import { followUpInstant, localFollowUpTime, reminderChangeOf } from '../../apps/web/src/pages/today/follow-up-time.js';
import { openQuick } from '../../apps/web/src/pages/today/today-open.js';
import { confirmedDateBody, formErrors, type OpenForm } from '../../apps/web/src/pages/today/TodayForms.js';

import { pagedToday } from './today-page-fixture.js';

const BUYER = '0199f0a0-0000-7000-8000-000000000002';

it('下次跟进按工作台时区来回转换，拒绝夏令时缺口及重叠的本地时间', () => {
  const previous = businessTimeZone();
  try {
    setBusinessTimeZone('Asia/Shanghai');
    const instant = '2026-11-23T02:00:00.000Z';
    expect(localFollowUpTime(instant)).toBe('2026-11-23T10:00');
    expect(reminderChangeOf('2026-11-24T10:00', instant)).toEqual({ nextFollowUpAt: '2026-11-24T02:00:00.000Z' });
    expect(reminderChangeOf('2026-11-23T10:00', instant)).toEqual({});
    expect(reminderChangeOf('', instant)).toEqual({ nextFollowUpAt: null });
    setBusinessTimeZone('America/Los_Angeles');
    expect(followUpInstant('2026-03-08T02:30')).toBeNull();
    expect(followUpInstant('2026-11-01T01:30')).toBeNull();
    expect(followUpInstant('2026-11-01T02:30')).toBe('2026-11-01T10:30:00.000Z');
  } finally {
    setBusinessTimeZone(previous);
  }
});

it.each(['shipments', 'receipts'] as const)('今日抽屉的 %s 把清空的单位提交为待核', async (kind) => {
  const previous = globalThis.fetch;
  const batchId = 'batch-1';
  const day = '2026-11-20';
  const facts = { unit: '  ', evidence: '  点收或交运凭据  ' };
  globalThis.fetch = (url, init) => {
    expect(url).toBe(`/api/v1/batches/${batchId}/${kind}`);
    if (typeof init?.body !== 'string') throw new Error('缺少发收提交');
    const body: unknown = JSON.parse(init.body);
    const expected = { id: 'record-1', batchId, qty: 3, source: 'workbench', note: null, createdBy: BUYER, voidedAt: null, voidedBy: null, voidReason: null };
    if (kind === 'shipments') {
      const request = CreateShipmentRequestSchema.parse(body);
      expect(request.fulfillment?.unit).toBeNull();
      return Promise.resolve(Response.json({ ...expected, source: 'manual', shippedOn: request.shippedOn, factoryShipmentRowId: null }));
    }
    const request = CreateReceiptRequestSchema.parse(body);
    expect(request.fulfillment?.unit).toBeNull();
    return Promise.resolve(Response.json({ ...expected, receivedOn: request.receivedOn, category: request.category }));
  };
  try {
    const result = kind === 'shipments'
      ? await postShipment({ batchId, qty: 3, shippedOn: day, fulfillment: { ...facts, kind: 'verified' } })
      : await postReceipt({ batchId, qty: 3, receivedOn: day, category: 'finished', fulfillment: { ...facts, kind: 'received', disposition: 'normal' } });
    expect(result.id).toBe('record-1');
  } finally {
    globalThis.fetch = previous;
  }
});

it('行或批次缺失时记跟进不打开，两者都在时记跟进打开', async () => {
  const missing = await draftsFor(item({ line: null, batch: null }), 'note');
  expect(missing).toEqual([]);
  const present = await draftsFor(item({
    line: {
      id: 'line-1',
      lane: 'finished',
      poRaw: null,
      poFormat: null,
      nameRaw: '面膜',
      itemCodeRaw: null,
      barcodeRaw: null,
      buyerName: null,
    },
    batch: {
      id: 'batch-1',
      seq: 1,
      plannedQty: 10,
      status: 'confirmed',
      noteStatus: 'missing',
      dateBuyerConfirmed: localDate('2026-10-07'),
      firstConfirmedDate: localDate('2026-10-07'),
      dateFactoryRequired: null,
      dateSupplierPromised: null,
      shippedQty: 0,
      receivedQty: 0,
      lastShippedOn: null,
    },
  }), 'note');
  expect(present[0]?.kind).toBe('note');
});

it('当前确认日已清空但首次确认日还在时，改期仍要带原因', async () => {
  const kept = await loadTarget(batch({ dateBuyerConfirmed: null, firstConfirmedDate: localDate('2026-10-02') }));
  expect(kept.hadDate).toBe(true);
  expect(formErrors({ draft: { kind: 'date', date: '2026-10-18', reason: '' }, hadDate: kept.hadDate, today: '2026-10-12' })).toEqual(['改已有确认日必须写原因']);
  expect(confirmedDateBody({ hadDate: kept.hadDate, date: '2026-10-18', reason: '补记' })).toEqual({ dateBuyerConfirmed: '2026-10-18', reason: '补记' });
  const fresh = await loadTarget(batch({ dateBuyerConfirmed: null, firstConfirmedDate: null }));
  expect(fresh.hadDate).toBe(false);
  expect(confirmedDateBody({ hadDate: fresh.hadDate, date: '2026-10-18', reason: '' })).toEqual({ dateBuyerConfirmed: '2026-10-18' });
});

function batch(patch: Partial<NonNullable<TodoItemView['batch']>>): NonNullable<TodoItemView['batch']> {
  return {
    id: 'batch-1',
    seq: 1,
    plannedQty: 10,
    status: 'received',
    noteStatus: 'missing',
    dateBuyerConfirmed: localDate('2026-10-07'),
    firstConfirmedDate: localDate('2026-10-07'),
    dateFactoryRequired: null,
    dateSupplierPromised: null,
    shippedQty: 0,
    receivedQty: 10,
    lastShippedOn: null,
    ...patch,
  };
}

const LINE: NonNullable<TodoItemView['line']> = {
  id: 'line-1',
  lane: 'finished',
  poRaw: null,
  poFormat: null,
  nameRaw: '面膜',
  itemCodeRaw: null,
  barcodeRaw: null,
  buyerName: null,
};

async function loadTarget(row: NonNullable<TodoItemView['batch']>): Promise<{ readonly hadDate: boolean }> {
  emptyReads();
  const previous = globalThis.fetch;
  const respond: typeof fetch = (input) => {
    const url = String(input);
    if (url.includes('/api/v1/me')) return Promise.resolve(Response.json({ id: BUYER, name: '采购甲', roles: ['buyer'], devLogin: true }));
    return Promise.resolve(Response.json(pagedToday(todayBody(item({ line: LINE, batch: row })))));
  };
  globalThis.fetch = respond;
  try {
    const loaded = await loadToday();
    const target = loaded.targets['todo-1'];
    if (target === undefined) throw new Error('没有批次目标');
    return target;
  } finally {
    globalThis.fetch = previous;
  }
}

async function draftsFor(row: TodoItemView, kind: OpenForm['kind']): Promise<readonly (OpenForm | null)[]> {
  emptyReads();
  const previous = globalThis.fetch;
  const respond: typeof fetch = (input) => {
    const url = String(input);
    if (url.includes('/api/v1/me')) return Promise.resolve(Response.json({ id: BUYER, name: '采购甲', roles: ['buyer'], devLogin: true }));
    return Promise.resolve(Response.json(pagedToday(todayBody(row))));
  };
  globalThis.fetch = respond;
  const drafts: (OpenForm | null)[] = [];
  try {
    const loaded = await loadToday();
    openQuick({
      id: row.id,
      kind,
      targets: loaded.targets,
      noteRefs: loaded.noteRefs,
      setFocus: () => undefined,
      setDraft: (draft) => { drafts.push(draft); },
      setDrawerId: () => undefined,
      setSaveError: () => undefined,
    });
    return drafts;
  } finally {
    globalThis.fetch = previous;
  }
}

function item(input: { readonly line: TodoItemView['line']; readonly batch: TodoItemView['batch'] }): TodoItemView {
  return {
    id: 'todo-1',
    subject: 'exception',
    reasons: ['exception_open'],
    severity: 2,
    ownerUserId: BUYER,
    waitingOn: { kind: 'internal', partyId: null },
    dueDate: null,
    overdueDays: null,
    refs: { orderLineId: 'line-1', batchId: 'batch-1', exceptionId: 'ex-1' },
    line: input.line,
    batch: input.batch,
    waitingOnParty: null,
    exception: { id: 'ex-1', type: 'delay', note: '晚了' },
  };
}

function todayBody(row: TodoItemView) {
  return {
    asOf: '2026-11-03',
    counts: {
      overdue: 0,
      demand_before_confirmed: 0,
      due_today: 0,
      missing_date: 0,
      shipped_not_received: 0,
      unshipped: 0,
      fulfillment_review: 0,
      follow_up_due: 0,
      follow_up_scheduled: 0,
      note_missing: 0,
      upcoming: 0,
      exception_open: 1,
      review_pending: 0,
      import_pending: 0,
      unassigned: 0,
    },
    items: [row],
    arrivalMemos: [],
    truncated: false,
  };
}
