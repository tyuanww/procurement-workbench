import { expect, it } from 'vitest';
import {batchFulfillment, localDate, type Settings, entityId} from '../../packages/domain/src/index.js';
import { filterTodosForUser, projectTodos, type TodoRule } from '../../packages/application/src/today/policies/index.js';
import type { TodoBatchSource, TodoInput } from '../../packages/application/src/today/views.js';
import { aUser } from '../../packages/testkit/src/index.js';

const today = localDate('2026-10-12');

function settings(patch: Partial<Settings> = {}): Settings {
  return {
    upcomingDays: 3,
    shippedNotReceivedAlertDays: null,
    deliveryNoteAlertDays: null,
    missingDateHintWindowDays: 7,
    dateSanityRange: { from: localDate('2020-01-01'), to: localDate('2030-12-31') },
    ownWarehousePartyId: null,
    ...patch,
  };
}

function batch(patch: Partial<TodoBatchSource> = {}): TodoBatchSource {
  return {
    id: 'b1',
    orderLineId: 'line-1',
    isLineCancelled: false,
    ownerUserId: 'buyer-1',
    status: 'confirmed',
    plannedQty: 10,
    dateBuyerConfirmed: localDate('2026-10-10'),
    dateFactoryRequired: null,
    dateSupplierPromised: null,
    receiverPartyId: 'warehouse',
    supplierPartyId: 'supplier',
    overdueDays: 2,
    noteStatus: 'missing',
    shipments: [],
    receipts: [],
    earliestHintDate: null,
    fulfillment: fulfillment({ plannedQty: 10, unit: '件' }),
    ...patch,
  };
}

function fulfillment(input: { readonly plannedQty: number; readonly unit: string | null; readonly shippedQty?: number }) {
  return batchFulfillment({
    batch: { plannedQty: input.plannedQty, plannedUnit: input.unit },
    shipments: input.shippedQty === undefined ? [] : [{ id: 'shipment', qty: input.shippedQty, fulfillment: { kind: 'verified', evidence: '交运单', unit: input.unit, reviewReason: null } }],
    receipts: [],
  });
}

function input(batches: readonly TodoBatchSource[], extra: Partial<TodoInput> = {}): TodoInput {
  return {
    batches,
    exceptions: [],
    reviewCounts: { aliases: 0, codes: 0, links: 0, multiName: 0 },
    uncommittedImports: [],
    ...extra,
  };
}

function reasonsOf(source: TodoBatchSource, patch: Partial<Settings> = {}) {
  return projectTodos({ input: input([source]), today, settings: settings(patch) }).find((item) => item.id === `batch:${source.id}`)?.reasons ?? [];
}

it('逾期未到是正例，没过确认日不是', () => {
  expect(reasonsOf(batch())).toContain('overdue');
  expect(reasonsOf(batch({ overdueDays: null, dateBuyerConfirmed: localDate('2026-10-20') }))).not.toContain('overdue');
});

it('部分实发后未发余量仍等供应商，已全发退出催货', () => {
  const open = projectTodos({ input: input([batch()]), today, settings: settings() })[0];
  expect(open?.waitingOn.kind).toBe('supplier');
  const partial = batch({ status: 'shipped', noteStatus: 'returned', fulfillment: fulfillment({ plannedQty: 10, unit: '件', shippedQty: 5 }) });
  expect(projectTodos({ input: input([partial]), today, settings: settings() })[0]?.waitingOn.kind).toBe('supplier');
  const shipped = batch({ ...partial, fulfillment: fulfillment({ plannedQty: 10, unit: '件', shippedQty: 10 }) });
  expect(projectTodos({ input: input([shipped]), today, settings: settings() })).toEqual([]);
});

it('需求日早于确认日才算，反过来不算', () => {
  expect(reasonsOf(batch({ dateFactoryRequired: localDate('2026-10-01'), overdueDays: null, dateBuyerConfirmed: localDate('2026-10-20') }))).toContain('demand_before_confirmed');
  expect(reasonsOf(batch({ dateFactoryRequired: localDate('2026-10-21'), overdueDays: null, dateBuyerConfirmed: localDate('2026-10-20') }))).not.toContain('demand_before_confirmed');
});

it('确认日就是今天算今日应到，明天不算', () => {
  expect(reasonsOf(batch({ dateBuyerConfirmed: today, overdueDays: null }))).toContain('due_today');
  expect(reasonsOf(batch({ dateBuyerConfirmed: localDate('2026-10-13'), overdueDays: null }))).not.toContain('due_today');
});

it('缺确认日期在提示窗口边界那天是 2，过一天是 1', () => {
  const onEdge = projectTodos({ input: input([batch({ status: 'awaiting_date', dateBuyerConfirmed: null, overdueDays: null, earliestHintDate: localDate('2026-10-19') })]), today, settings: settings() });
  const later = projectTodos({ input: input([batch({ status: 'awaiting_date', dateBuyerConfirmed: null, overdueDays: null, earliestHintDate: localDate('2026-10-20') })]), today, settings: settings() });
  expect(onEdge[0]?.severity).toBe(2);
  expect(later[0]?.severity).toBe(1);
  expect(reasonsOf(batch({ status: 'confirmed', overdueDays: null, dateBuyerConfirmed: localDate('2026-10-20') }))).not.toContain('missing_date');
});

it('单位待核时不把历史发货登记当作可催量或待收量', () => {
  const source = batch({ status: 'shipped', noteStatus: 'returned', fulfillment: fulfillment({ plannedQty: 10, unit: null }) });
  const [todo] = projectTodos({ input: input([source]), today, settings: settings() });
  expect(todo).toMatchObject({ waitingOn: { kind: 'internal' }, reasons: ['fulfillment_review'] });
  expect(todo?.remaining).toBeUndefined();
});

it('已收货但送货单未回只带 note_missing', () => {
  const items = projectTodos({ input: input([batch({ status: 'received', overdueDays: 5, noteStatus: 'missing', receipts: [{ qty: 10, receivedOn: localDate('2026-10-09') }] })]), today, settings: settings() });
  expect(items).toHaveLength(1);
  expect(items[0]?.reasons).toEqual(['note_missing']);
});

it('送货单未回在阈值为空时是 1，超过阈值升到 2', () => {
  const source = batch({ status: 'received', overdueDays: null, dateBuyerConfirmed: null, noteStatus: 'missing', receipts: [{ qty: 10, receivedOn: localDate('2026-10-08') }] });
  expect(projectTodos({ input: input([source]), today, settings: settings({ deliveryNoteAlertDays: null }) })[0]?.severity).toBe(1);
  expect(projectTodos({ input: input([source]), today, settings: settings({ deliveryNoteAlertDays: 2 }) })[0]?.severity).toBe(2);
  expect(reasonsOf(batch({ status: 'received', noteStatus: 'returned', overdueDays: null, dateBuyerConfirmed: null }))).not.toContain('note_missing');
});

it('确认日在提前期内算即将到期，当天和更远不算', () => {
  expect(reasonsOf(batch({ dateBuyerConfirmed: localDate('2026-10-14'), overdueDays: null }))).toContain('upcoming');
  expect(reasonsOf(batch({ dateBuyerConfirmed: today, overdueDays: null }))).not.toContain('upcoming');
  expect(reasonsOf(batch({ dateBuyerConfirmed: localDate('2026-10-20'), overdueDays: null }))).not.toContain('upcoming');
});

it('开放异常产生待办，没有异常就不产生', () => {
  const withException = projectTodos({ input: input([], { exceptions: [{ id: 'e1', orderLineId: 'line-1', batchId: null, type: 'quality', note: '破损', openedBy: 'buyer-1' }] }), today, settings: settings() });
  expect(withException.map((item) => item.reasons)).toEqual([['exception_open']]);
  expect(projectTodos({ input: input([]), today, settings: settings() })).toEqual([]);
});

it('审核队列非空才给审核人看，采购员看不到', () => {
  const todos = projectTodos({ input: input([], { reviewCounts: { aliases: 1, codes: 0, links: 0, multiName: 0 } }), today, settings: settings() });
  expect(filterTodosForUser({ todos, actor: aUser({ roles: ['reviewer'] }), scope: 'all' })).toHaveLength(1);
  expect(filterTodosForUser({ todos, actor: aUser({ roles: ['buyer'] }), scope: 'all' })).toEqual([]);
  expect(projectTodos({ input: input([]), today, settings: settings() })).toEqual([]);
});

it('自己上传的未提交批次超过一天才出现，正好一天不出现', () => {
  const old = projectTodos({ input: input([], { uncommittedImports: [{ id: 'i1', createdBy: 'buyer-1', createdAt: '2026-10-10T00:00:00.000Z' }] }), today, settings: settings() });
  const exact = projectTodos({ input: input([], { uncommittedImports: [{ id: 'i1', createdBy: 'buyer-1', createdAt: '2026-10-11T00:00:00.000Z' }] }), today, settings: settings() });
  expect(old.map((item) => item.id)).toEqual(['import:i1']);
  expect(exact).toEqual([]);
});

it('没有负责人时把未分配叠加上去，不提高严重度', () => {
  const item = projectTodos({ input: input([batch({ ownerUserId: null })]), today, settings: settings() })[0];
  expect(item?.reasons).toContain('unassigned');
  expect(item?.severity).toBe(3);
  expect(projectTodos({ input: input([batch({ ownerUserId: null, status: 'confirmed', overdueDays: null, dateBuyerConfirmed: localDate('2026-10-20') })]), today, settings: settings() })[0]?.reasons).toEqual(['unshipped', 'unassigned']);
});

it('同交期同单位按剩余未发量排序，与其他单位分组', () => {
  const small = batch({ id: 'small', orderLineId: 'a', fulfillment: fulfillment({ plannedQty: 100000, unit: '件', shippedQty: 90000 }) });
  const other = batch({ id: 'other', orderLineId: 'b', fulfillment: fulfillment({ plannedQty: 200000, unit: 'kg' }) });
  const large = batch({ id: 'large', orderLineId: 'c', fulfillment: fulfillment({ plannedQty: 30000, unit: '件' }) });
  const items = projectTodos({ input: input([small, other, large]), today, settings: settings() });
  expect(items.filter((item) => item.remaining?.unit === '件').map((item) => item.id)).toEqual(['batch:large', 'batch:small']);
  expect(projectTodos({ input: input([large, other, small]), today, settings: settings() })).toEqual(items);
});

it('同一个批次多个原因只有一条待办，严重度取最大', () => {
  const items = projectTodos({ input: input([batch({ dateFactoryRequired: localDate('2026-10-01') })]), today, settings: settings() });
  expect(items).toHaveLength(1);
  expect(items[0]?.reasons).toEqual(expect.arrayContaining(['overdue', 'demand_before_confirmed']));
  expect(items[0]?.severity).toBe(3);
});

it('同一输入跑两次结果相同，打乱输入也不改变输出顺序', () => {
  const sources = [
    batch({ id: 'late', orderLineId: 'z', overdueDays: 1, dateBuyerConfirmed: localDate('2026-10-11') }),
    batch({ id: 'worse', orderLineId: 'a', overdueDays: 9, dateBuyerConfirmed: localDate('2026-10-03') }),
  ];
  const first = projectTodos({ input: input(sources), today, settings: settings() });
  const second = projectTodos({ input: input(sources), today, settings: settings() });
  const worse = sources[0];
  const late = sources[1];
  if (worse === undefined || late === undefined) throw new Error('样例不完整');
  const shuffled = projectTodos({ input: input([late, worse]), today, settings: settings() });
  expect(second).toEqual(first);
  expect(shuffled.map((item) => item.id)).toEqual(first.map((item) => item.id));
  expect(first.map((item) => item.id)).toEqual(['batch:worse', 'batch:late']);
});

it('传入额外规则就能产生新原因，不用改投影函数', () => {
  const extra: TodoRule = {
    reason: 'probe',
    applies: () => true,
    severity: () => 1,
    waitingOn: () => ({ kind: 'internal', partyId: null }),
  };
  const items = projectTodos({ input: input([batch({ status: 'closed', overdueDays: null, dateBuyerConfirmed: null, noteStatus: 'returned' })]), today, settings: settings(), rules: [extra] });
  expect(items[0]?.reasons).toContain('probe');
});

it('采购员默认只看自己的和未分配', () => {
  const todos = projectTodos({ input: input([
    batch({ id: 'mine', ownerUserId: 'buyer-1' }),
    batch({ id: 'other', orderLineId: 'line-2', ownerUserId: 'buyer-2' }),
    batch({ id: 'free', orderLineId: 'line-3', ownerUserId: null }),
  ]), today, settings: settings() });
  const mine = filterTodosForUser({ todos, actor: aUser({ id: entityId('buyer-1'), roles: ['buyer'] }), scope: 'mine' });
  expect(mine.map((item) => item.id).sort()).toEqual(['batch:free', 'batch:mine']);
});
