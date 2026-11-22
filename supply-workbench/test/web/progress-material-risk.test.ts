import { afterEach, expect, it, vi } from 'vitest';
import type { TodayResponse, TodoItemView, StoreProgressMaterial } from '../../packages/contracts/src/index.js';
import { batchFulfillment, localDate } from '../../packages/domain/src/index.js';
import { progressMaterialRisks, risksForLine } from '../../apps/web/src/features/progress/index.js';
import { progressActionSource } from '../../apps/web/src/pages/progress/progress-action-source.js';
import { emptyReads } from '../../apps/web/src/shared/api/reads.js';

const day = localDate('2026-11-19');
const due = localDate('2026-11-15');
const counts: TodayResponse['counts'] = {
  overdue: 501, demand_before_confirmed: 0, due_today: 0, missing_date: 0, shipped_not_received: 0, note_missing: 0,
  upcoming: 0, unshipped: 501, fulfillment_review: 0, follow_up_due: 0, follow_up_scheduled: 0, exception_open: 0, review_pending: 0, import_pending: 0, unassigned: 0,
};
const material: StoreProgressMaterial = {
  id: 'shared-material', nameRaw: '共用瓶盖', codeRaw: 'CAP-11', poRaw: 'PO-M', completed: false,
  unit: '个', quantity: 25, deliveryProgressRaw: null, reportedGap: null,
  source: { importBatchId: 'source-1', sheetName: '达肤妍项目进度表', rowNo: 7 },
};

afterEach(() => {
  vi.unstubAllGlobals();
  emptyReads();
});

it('首批以外的实物风险按物料 ID 分别投影给两个成品，采购待办仍只有一条', async () => {
  const initial = today();
  const task = overdueMaterial();
  const calls: string[] = [];
  vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
    calls.push(String(input));
    return Promise.resolve(Response.json({
      ...initial, items: [task], truncated: false,
      paging: { page: 6, pageSize: 100, total: 501, urgent: 1, reasonCounts: counts, units: ['个'], factories: [] },
    }));
  });
  const [source, concurrent] = await Promise.all([progressActionSource(initial), progressActionSource(initial)]);
  expect(calls).toEqual(['/api/v1/today?scope=all&page=6&pageSize=100']);
  expect(concurrent).toEqual(source);
  expect(source.notice).toBe('');
  expect(source.items.filter((item) => item.refs.batchId === 'shared-batch')).toHaveLength(1);
  const risks = progressMaterialRisks([...source.items, task]);
  const finished = (materials: readonly StoreProgressMaterial[]) => ({ storeProgress: { store: 'dafuyan' as const, sources: [], materials } });
  const expected = [{ materialId: material.id, batchId: 'shared-batch', label: '共用瓶盖 · CAP-11 · PO-M', overdueDays: 4, unshippedQty: 25, unit: '个', seq: 3 }];
  expect(risksForLine(finished([material]), risks)).toEqual(expected);
  expect(risksForLine(finished([{ ...material, source: { ...material.source, rowNo: 8 } }]), risks)).toEqual(expected);
  expect(risksForLine(finished([{ ...material, id: 'same-name-other-material' }]), risks)).toEqual([]);
});

it('后续页出错时保留已读待办并标明风险需核对，缺实物依据不显示风险', async () => {
  const initial = today();
  vi.stubGlobal('fetch', () => Promise.resolve(Response.json({ code: 'INTERNAL', message: '错误' }, { status: 500 })));
  await expect(progressActionSource(initial)).resolves.toMatchObject({ items: initial.items, notice: expect.stringContaining('仍需核对') });
  const task = overdueMaterial();
  if (task.batch === null) throw new Error('缺批次');
  const { fulfillment, ...batch } = task.batch;
  void fulfillment;
  expect(progressMaterialRisks([{ ...task, batch }]).size).toBe(0);
});

function today(): TodayResponse {
  const task = overdueMaterial();
  if (task.batch === null) throw new Error('缺批次');
  const olderDate = localDate('2026-11-09');
  const batch = { ...task.batch, dateBuyerConfirmed: olderDate };
  const items = Array.from({ length: 500 }, (_unused, index) => ({
    ...task, id: `batch:older-${index}`, overdueDays: 10, dueDate: olderDate,
    refs: { orderLineId: `unrelated-${index}`, batchId: `older-${index}` }, batch: { ...batch, id: `older-${index}` },
  }));
  return { asOf: day, counts, items, arrivalMemos: [], truncated: true };
}

function overdueMaterial(): TodoItemView {
  return {
    id: 'batch:shared-batch', subject: 'batch', reasons: ['overdue', 'unshipped'], severity: 3, overdueDays: 4, dueDate: due,
    ownerUserId: 'other-buyer', waitingOn: { kind: 'supplier', partyId: 'supplier' },
    refs: { orderLineId: material.id, batchId: 'shared-batch' },
    line: null, waitingOnParty: null, exception: null,
    batch: {
      id: 'shared-batch', seq: 3, plannedQty: 25, status: 'confirmed', noteStatus: 'missing', dateBuyerConfirmed: due, firstConfirmedDate: due,
      dateFactoryRequired: null, dateSupplierPromised: null, shippedQty: 0, receivedQty: 0, lastShippedOn: null,
      fulfillment: batchFulfillment({ batch: { plannedQty: 25, plannedUnit: '个' }, shipments: [], receipts: [] }),
    },
  };
}
