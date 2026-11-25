import { createRequire } from 'node:module';
import path from 'node:path';
import type { TodoItemView } from '../../packages/contracts/src/index.js';
import { TodayPage } from '../../apps/web/src/pages/today/TodayPage.js';
import { element, useHostSearch } from './party-preview-dom.js';

const requireWeb = createRequire(path.join(process.cwd(), 'apps/web/package.json'));

export function batchTodo(seq: number): TodoItemView {
  const id = `batch-${seq}`;
  return {
    id: `batch:${id}`, subject: 'batch', reasons: ['missing_date'], severity: 1, ownerUserId: 'buyer-1',
    waitingOn: { kind: 'supplier', partyId: null }, dueDate: null, overdueDays: null, refs: { orderLineId: 'line', batchId: id },
    line: { id: 'line', lane: 'finished', poRaw: 'PO', poFormat: 'OTHER', nameRaw: '同名样品', itemCodeRaw: null, barcodeRaw: null, buyerName: null },
    batch: { id, seq, plannedQty: 10, status: 'awaiting_date', noteStatus: 'missing', dateBuyerConfirmed: null, firstConfirmedDate: null,
      dateFactoryRequired: null, dateSupplierPromised: null, shippedQty: null, receivedQty: null, lastShippedOn: null },
    waitingOnParty: null, exception: null,
  };
}

export function antdApp(children: unknown) {
  const antd: unknown = requireWeb('antd');
  if (typeof antd !== 'object' || antd === null || !('App' in antd)) throw new Error('没有 Ant Design App');
  return element(antd.App, { children });
}

export function LocationAndToday() {
  const [search] = useHostSearch();
  return element('div', { children: [
    element('output', { key: 'url', children: search.toString() }),
    element(TodayPage, { key: 'today' }),
  ] });
}

export function pageBody(total: number) {
  const counts = {
    overdue: 0, demand_before_confirmed: 0, due_today: 0, missing_date: 0, shipped_not_received: 0, note_missing: 0, upcoming: 0,
    unshipped: 0, fulfillment_review: 0, follow_up_due: 0, follow_up_scheduled: 0, exception_open: 0, review_pending: 0, import_pending: 0, unassigned: 0,
  };
  return {
    asOf: '2026-11-21', counts, items: [], arrivalMemos: [], truncated: false,
    paging: { page: 1, pageSize: 50, total, reasonCounts: counts, urgent: 0, units: [], factories: [],
      inboxCounts: { today: total, scheduled: 0, unassigned: 0 }, pendingCount: 0 },
  };
}
