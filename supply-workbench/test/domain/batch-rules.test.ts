import { deliveryBatchId, entityId, orderLineId, type DeliveryBatchId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { DomainRuleViolation } from '../../packages/domain/src/errors.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import { addDays, businessDay, compareDates, diffDays, weekStart } from '../../packages/domain/src/dates.js';
import { isDueToday, isUpcoming, overdueDays } from '../../packages/domain/src/overdue.js';
import { deriveBatchStatus, noteStatus, qtyVariance } from '../../packages/domain/src/batch/status.js';
import { batchFulfillment } from '../../packages/domain/src/batch/fulfillment.js';
import {
  addReceipt,
  addShipment,
  applyConfirmedDate,
  assertBatchDeletable,
  cancelBatch,
  closeBatch,
  createBatch,
  reopenBatch,
  setDeliveryNote,
  undoRecord,
  updateBatchFields,
  voidRecord,
  type BatchRecords,
  type RuleContext,
} from '../../packages/domain/src/batch/change.js';

const day = localDate;
const at = '2026-10-12T00:00:00.000Z';

function ctx(over: Partial<RuleContext<DeliveryBatchId>> = {}): RuleContext<DeliveryBatchId> {
  return { at, by: entityId('buyer-1'), isAdmin: false, nextId: deliveryBatchId('new-1'), ...over };
}

function records(plannedQty = 10, confirmed: string | null = '2026-10-10'): BatchRecords {
  const batch = createBatch({
    orderLineId: orderLineId('line-1'),
    seq: 1,
    plannedQty,
    receiverPartyId: entityId('recv-1'),
    dateBuyerConfirmed: confirmed === null ? null : day(confirmed),
    origin: 'manual',
  }, ctx());
  return { batch, shipments: [], receipts: [], deliveryNote: null };
}

it('业务日按传入时区计算，不读时钟', () => {
  expect(businessDay('2026-10-11T15:30:00.000Z', 'Asia/Shanghai')).toBe(day('2026-10-11'));
  expect(businessDay('2026-10-11T16:00:00.000Z', 'Asia/Shanghai')).toBe(day('2026-10-12'));
});

it('日期加减、比较和周一', () => {
  expect(addDays(day('2024-02-28'), 1)).toBe(day('2024-02-29'));
  expect(addDays(day('2023-02-28'), 1)).toBe(day('2023-03-01'));
  expect(diffDays(day('2026-10-12'), day('2026-10-10'))).toBe(2);
  expect(compareDates(day('2026-10-01'), day('2026-10-02'))).toBe(-1);
  expect(weekStart(day('2024-01-03'))).toBe(day('2024-01-01'));
  expect(weekStart(day('2024-01-07'))).toBe(day('2024-01-01'));
});

it('02 第 5.1 节每个状态都能推导出来', () => {
  expect(records(10, null).batch.status).toBe('awaiting_date');
  expect(records().batch.status).toBe('confirmed');
  const shipped = addShipment({ records: records(), input: { qty: 1, shippedOn: day('2026-10-11') }, ctx: ctx() });
  expect(shipped.batch.status).toBe('shipped');
  const partial = addReceipt({ records: shipped, input: { qty: 4, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx({ nextId: deliveryBatchId('r1') }) });
  expect(partial.batch.status).toBe('partially_received');
  const received = addReceipt({ records: partial, input: { qty: 8, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx({ nextId: deliveryBatchId('r2') }) });
  expect(received.batch.status).toBe('received');
  expect(qtyVariance({ plannedQty: 10, receipts: received.receipts })).toBe(2);
  expect(closeBatch(partial, { reason: '尾数不再送', ctx: ctx() }).status).toBe('closed');
  expect(cancelBatch(partial, { reason: '客户取消', ctx: ctx() }).status).toBe('cancelled');
});

it('作废收货后状态倒退，重新打开后按记录推导', () => {
  const received = addReceipt({ records: records(), input: { qty: 10, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx() });
  const voided = voidRecord(received, { kind: 'receipt', recordId: received.receipts[0]?.id ?? '', reason: '登记错了', ctx: ctx({ at: '2026-10-12T00:00:20.000Z' }) });
  expect(voided.batch.status).toBe('confirmed');
  const closed = closeBatch(received, { reason: '结束', ctx: ctx() });
  const opened = reopenBatch({ ...received, batch: closed }, { reason: '还要收', ctx: ctx() });
  expect(opened.status).toBe('received');
  expect(opened.closedAt).toBeNull();
});

it('计划半入值使用数据库的四位十进制口径，实收不足仍保持部分收货', () => {
  const first = addReceipt({ records: records(0.2), input: { qty: 0.1003, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx() });
  const changed = updateBatchFields({
    batch: first.batch,
    patch: { plannedQty: 0.10035 },
    records: { ...first, ...ctx() },
  });
  expect(changed.batch.status).toBe('partially_received');
  expect(qtyVariance({ plannedQty: changed.batch.plannedQty, receipts: first.receipts })).toBe(-0.0001);
});

it('先按持久化精度确认每笔实收，再汇总判断是否收齐', () => {
  const matching = {
    plannedQty: 0.2008, dateBuyerConfirmed: day('2026-10-12'), cancelledAt: null, closedAt: null,
    receipts: [{ qty: 0.10035 }, { qty: 0.10035 }], shipments: [],
  };
  expect(deriveBatchStatus(matching)).toBe('received');
  expect(qtyVariance(matching)).toBe(0);
});

it('补录计划单位后，旧单位占位的发收凭据仍待核，不抬高已核实量', () => {
  const before = records(1);
  const saved = addReceipt({ records: before, input: { qty: 1, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx() });
  const receipts = saved.receipts.map((row) => ({ ...row, fulfillment: { kind: 'received' as const, disposition: 'normal' as const, unit: '／', evidence: '旧确认单 1', reviewReason: null } }));
  const updated = updateBatchFields({
    batch: { ...saved.batch, plannedUnit: '／' },
    patch: { plannedUnit: '件' },
    records: { ...saved, receipts, ...ctx() },
  });
  expect(updated.batch.status).toBe('confirmed');
  expect(batchFulfillment({ batch: updated.batch, shipments: [], receipts })).toMatchObject({
    unit: '件', receivedQty: null, verifiedReceivedQty: 0, unshippedQty: null, reviewCount: 1,
  });
});

it('关闭后不能再加发货或收货', () => {
  const closed = closeBatch(records(), { reason: '结束', ctx: ctx() });
  const locked = { ...records(), batch: closed };
  expect(() => addShipment({ records: locked, input: { qty: 1, shippedOn: day('2026-10-12') }, ctx: ctx() })).toThrow(DomainRuleViolation);
  expect(() => addReceipt({ records: locked, input: { qty: 1, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx() })).toThrow(DomainRuleViolation);
});

it('第一次确认到货日不要求原因，之后改必须写原因，首次日期不变', () => {
  const created = records(10, null);
  const first = applyConfirmedDate(created, { date: day('2026-10-20'), reason: null, ctx: ctx() });
  expect(first.batch.firstConfirmedDate).toBe(day('2026-10-20'));
  expect(first.dateChange?.reason).toBeNull();
  expect(() => applyConfirmedDate({ ...created, batch: first.batch }, { date: day('2026-10-21'), reason: null, ctx: ctx() })).toThrow(DomainRuleViolation);
  const second = applyConfirmedDate({ ...created, batch: first.batch }, { date: day('2026-10-21'), reason: '工厂排产延后', ctx: ctx({ nextId: deliveryBatchId('chg-2') }) });
  expect(second.batch.firstConfirmedDate).toBe(day('2026-10-20'));
  expect(second.batch.dateBuyerConfirmed).toBe(day('2026-10-21'));
});

it('需求表生成的代工厂需求日不能改', () => {
  const batch = createBatch({
    orderLineId: orderLineId('line-1'), seq: 1, plannedQty: 1, receiverPartyId: entityId('recv-1'), origin: 'from_factory_demand', dateFactoryRequired: day('2026-10-01'),
  }, ctx());
  expect(() => updateBatchFields({ batch, patch: { dateFactoryRequired: day('2026-10-02') }, records: { shipments: [], receipts: [], at, by: entityId('buyer-1'), nextId: deliveryBatchId('chg-1') } })).toThrow(DomainRuleViolation);
});

it('第 9 秒能撤销，第 11 秒不能，别人的不能', () => {
  const added = addShipment({ records: records(), input: { qty: 1, shippedOn: day('2026-10-11') }, ctx: ctx() });
  const id = added.shipments[0]?.id ?? '';
  const undone = undoRecord(added, { kind: 'shipment', recordId: id, ctx: ctx({ at: '2026-10-12T00:00:09.000Z' }) });
  expect(undone.shipments).toHaveLength(0);
  expect(undone.batch.status).toBe('confirmed');
  expect(() => undoRecord(added, { kind: 'shipment', recordId: id, ctx: ctx({ at: '2026-10-12T00:00:11.000Z' }) })).toThrow(DomainRuleViolation);
  expect(() => undoRecord(added, { kind: 'shipment', recordId: id, ctx: ctx({ by: entityId('other'), at: '2026-10-12T00:00:01.000Z' }) })).toThrow(DomainRuleViolation);
});

it('有记录的批次不能删除，没有记录可以', () => {
  expect(() => assertBatchDeletable(records())).not.toThrow();
  const withNote = setDeliveryNote({ records: records(), input: { status: 'returned', date: day('2026-10-12') }, ctx: ctx() });
  expect(() => assertBatchDeletable(withNote)).toThrow(DomainRuleViolation);
  expect(noteStatus(withNote.deliveryNote)).toBe('returned');
  expect(noteStatus(null)).toBe('missing');
});

it('逾期只看确认到货日，开放且晚于今天才算', () => {
  const confirmed = records().batch;
  expect(overdueDays(confirmed, day('2026-10-12'))).toBe(2);
  expect(overdueDays({ ...confirmed, dateBuyerConfirmed: day('2026-10-20') }, day('2026-10-12'))).toBeNull();
  expect(overdueDays({ ...confirmed, status: 'closed' }, day('2026-10-20'))).toBeNull();
  expect(isDueToday(confirmed, day('2026-10-10'))).toBe(true);
  expect(isUpcoming({ batch: { ...confirmed, dateBuyerConfirmed: day('2026-10-14') }, today: day('2026-10-12'), upcomingDays: 3 })).toBe(true);
  expect(isUpcoming({ batch: confirmed, today: day('2026-10-12'), upcomingDays: 3 })).toBe(false);
});

it('数量不大于 0、重复送货单、窗口内作废都会拒绝', () => {
  expect(compareDates(day('2026-10-12'), day('2026-10-12'))).toBe(0);
  expect(() => createBatch({ orderLineId: orderLineId('line-1'), seq: 1, plannedQty: 0, receiverPartyId: entityId('recv-1'), origin: 'manual' }, ctx())).toThrow(DomainRuleViolation);
  const noted = setDeliveryNote({ records: records(), input: { status: 'returned', date: day('2026-10-12') }, ctx: ctx() });
  expect(() => setDeliveryNote({ records: noted, input: { status: 'verified', date: day('2026-10-13') }, ctx: ctx({ nextId: deliveryBatchId('note-2') }) })).toThrow(DomainRuleViolation);
  const added = addShipment({ records: records(), input: { qty: 1, shippedOn: day('2026-10-11') }, ctx: ctx() });
  expect(() => voidRecord(added, { kind: 'shipment', recordId: added.shipments[0]?.id ?? '', reason: '错了', ctx: ctx({ at: '2026-10-12T00:00:01.000Z' }) })).toThrow(DomainRuleViolation);
});

it('作废后的发货不参与状态', () => {
  const facts = { cancelledAt: null, closedAt: null, plannedQty: 10, dateBuyerConfirmed: day('2026-10-01'), receipts: [], shipments: [{ voidedAt: at }] };
  expect(deriveBatchStatus(facts)).toBe('confirmed');
});

it('计划数量舍入为零时，没有实收仍等待发货', () => {
  const facts = { cancelledAt: null, closedAt: null, plannedQty: 0.00001, dateBuyerConfirmed: day('2026-10-01'), receipts: [], shipments: [] };
  expect(deriveBatchStatus(facts)).toBe('confirmed');
});
