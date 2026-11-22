import { deliveryBatchId, entityId, orderLineId, type DeliveryBatchId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { DomainRuleViolation } from '../../packages/domain/src/errors.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import { addDays, businessDay, diffDays, weekStart } from '../../packages/domain/src/dates.js';
import { isDueToday, isUpcoming, overdueDays } from '../../packages/domain/src/overdue.js';
import { deriveBatchStatus, noteStatus, qtyVariance } from '../../packages/domain/src/batch/status.js';
import {
  addReceipt,
  addShipment,
  applyConfirmedDate,
  cancelBatch,
  closeBatch,
  createBatch,
  reopenBatch,
  setDeliveryNote,
  undoRecord,
  updateBatchFields,
  voidRecord,
  type RuleContext,
} from '../../packages/domain/src/batch/change.js';

const day = localDate;
const at = '2026-10-12T00:00:00.000Z';

function ctx(over: Partial<RuleContext<DeliveryBatchId>> = {}): RuleContext<DeliveryBatchId> {
  return { at, by: entityId('buyer-1'), isAdmin: false, nextId: deliveryBatchId('new-1'), ...over };
}

function ruleCode(run: () => void): string {
  try {
    run();
  } catch (error) {
    if (error instanceof DomainRuleViolation) return error.code;
    throw error;
  }
  throw new Error('应该拒绝');
}

function openBatch(plannedQty = 10) {
  const batch = createBatch({
    orderLineId: orderLineId('line-1'),
    seq: 1,
    plannedQty,
    receiverPartyId: entityId('recv-1'),
    dateBuyerConfirmed: day('2026-10-10'),
    origin: 'manual',
  }, ctx());
  return { batch, shipments: [], receipts: [], deliveryNote: null };
}

it('时区参数会改变业务日，非法时刻和时区都拒绝', () => {
  expect(businessDay('2026-10-11T16:00:00.000Z', 'UTC')).toBe(day('2026-10-11'));
  expect(businessDay('2026-10-11T03:30:00.000Z', 'America/New_York')).toBe(day('2026-10-10'));
  expect(() => businessDay('不是时刻', 'Asia/Shanghai')).toThrow('业务日无法从时区算出');
  expect(() => businessDay('2026-10-11T00:00:00.000Z', '不存在/时区')).toThrow('业务日无法从时区算出');
});

it('跨月、闰年、周一和范围外天数', () => {
  expect(addDays(day('2026-12-31'), 1)).toBe(day('2027-01-01'));
  expect(addDays(day('2026-03-01'), -1)).toBe(day('2026-02-28'));
  expect(addDays(day('1900-02-28'), 1)).toBe(day('1900-03-01'));
  expect(addDays(day('2000-02-28'), 1)).toBe(day('2000-02-29'));
  expect(diffDays(day('2024-01-01'), day('2025-01-01'))).toBe(-366);
  expect(weekStart(day('2023-12-31'))).toBe(day('2023-12-25'));
  expect(weekStart(day('2024-01-01'))).toBe(day('2024-01-01'));
  expect(() => addDays(day('2026-10-12'), 1.5)).toThrow('天数必须是整数');
  expect(() => addDays(day('9999-12-31'), 1)).toThrow('业务日超出范围');
  expect(() => addDays(day('0001-01-01'), -1)).toThrow('业务日超出范围');
  expect(() => addDays(day('0000-01-01'), 0)).toThrow('业务日超出范围');
});

it('已发未收过了确认日也逾期，关闭的不算今日应到', () => {
  const shipped = addShipment({ records: openBatch(), input: { qty: 1, shippedOn: day('2026-10-11') }, ctx: ctx() });
  expect(overdueDays(shipped.batch, day('2026-10-12'))).toBe(2);
  const partial = addReceipt({ records: shipped, input: { qty: 1, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx({ nextId: deliveryBatchId('r1') }) });
  expect(overdueDays(partial.batch, day('2026-10-12'))).toBe(2);
  const closed = closeBatch(openBatch(), { reason: '结束', ctx: ctx() });
  expect(isDueToday(closed, day('2026-10-10'))).toBe(false);
  expect(isUpcoming({ batch: closed, today: day('2026-10-09'), upcomingDays: 3 })).toBe(false);
  expect(() => isUpcoming({ batch: openBatch().batch, today: day('2026-10-12'), upcomingDays: Number.NaN })).toThrow('提前期必须是有限数字');
});

it('创建时写入的首次确认日之后不变，清空当前日期也不动它', () => {
  const created = createBatch({
    orderLineId: orderLineId('line-1'), seq: 1, plannedQty: 1, receiverPartyId: entityId('recv-1'), origin: 'manual', dateBuyerConfirmed: day('2026-10-01'),
  }, ctx());
  const changed = applyConfirmedDate({ batch: created, shipments: [], receipts: [] }, {
    date: null,
    reason: '改去向',
    ctx: ctx({ nextId: deliveryBatchId('chg-2') }),
  });
  expect(changed.batch.firstConfirmedDate).toBe(day('2026-10-01'));
  expect(changed.batch.dateBuyerConfirmed).toBeNull();
  expect(changed.batch.status).toBe('awaiting_date');
});

it('完全收货后仍可改确认到货日，首次日期、原因和收货数量保持', () => {
  const received = addReceipt({ records: openBatch(), input: { qty: 10, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx() });
  expect(received.batch.status).toBe('received');
  const changed = applyConfirmedDate(received, { date: day('2026-10-20'), reason: '到货后改期', ctx: ctx({ nextId: deliveryBatchId('moved-date') }) });
  expect(changed.batch.dateBuyerConfirmed).toBe(day('2026-10-20'));
  expect(changed.batch.status).toBe('received');
  expect(changed.batch.firstConfirmedDate).toBe(day('2026-10-10'));
  expect(changed.dateChange?.field).toBe('dateBuyerConfirmed');
  expect(changed.dateChange?.oldValue).toBe(day('2026-10-10'));
  expect(changed.dateChange?.newValue).toBe(day('2026-10-20'));
  expect(changed.dateChange?.reason).toBe('到货后改期');
  expect(received.receipts[0]?.qty).toBe(10);
  expect(received.receipts[0]?.receivedOn).toBe(day('2026-10-12'));
  expect(overdueDays(changed.batch, day('2026-10-21'))).toBeNull();
  expect(isDueToday(changed.batch, day('2026-10-20'))).toBe(false);
  expect(isUpcoming({ batch: changed.batch, today: day('2026-10-19'), upcomingDays: 3 })).toBe(false);
  expect(ruleCode(() => applyConfirmedDate(received, {
    date: day('2026-10-21'),
    reason: '   ',
    ctx: ctx({ nextId: deliveryBatchId('blank-date') }),
  }))).toBe('DATE_CHANGE_REASON_REQUIRED');
  expect(applyConfirmedDate(received, { date: day('2026-10-10'), reason: '同一天', ctx: ctx({ nextId: deliveryBatchId('same-date') }) }).dateChange).toBeNull();
  const bare = createBatch({
    orderLineId: orderLineId('line-1'), seq: 1, plannedQty: 4, receiverPartyId: entityId('recv-1'), origin: 'manual',
  }, ctx({ nextId: deliveryBatchId('bare') }));
  const covered = addReceipt({
    records: { batch: bare, shipments: [], receipts: [], deliveryNote: null },
    input: { qty: 4, receivedOn: day('2026-10-12'), category: 'finished' },
    ctx: ctx({ nextId: deliveryBatchId('bare-receipt') }),
  });
  const first = applyConfirmedDate(covered, { date: day('2026-10-18'), reason: null, ctx: ctx({ nextId: deliveryBatchId('first-date') }) });
  expect(first.batch.dateBuyerConfirmed).toBe(day('2026-10-18'));
  expect(first.batch.firstConfirmedDate).toBe(day('2026-10-18'));
  expect(first.batch.status).toBe('received');
  const cleared = applyConfirmedDate({ batch: changed.batch, shipments: received.shipments, receipts: received.receipts }, {
    date: null,
    reason: '改去向',
    ctx: ctx({ nextId: deliveryBatchId('clear-date') }),
  });
  expect(cleared.batch.dateBuyerConfirmed).toBeNull();
  expect(cleared.batch.firstConfirmedDate).toBe(day('2026-10-10'));
  expect(cleared.batch.status).toBe('received');
  const closed = closeBatch(openBatch(), { reason: '结束', ctx: ctx() });
  expect(ruleCode(() => applyConfirmedDate({ batch: closed, shipments: [], receipts: [] }, {
    date: day('2026-11-01'),
    reason: '还想改',
    ctx: ctx({ nextId: deliveryBatchId('closed-date') }),
  }))).toBe('STATE_CONFLICT');
  const cancelled = cancelBatch(openBatch(), { reason: '客户取消', ctx: ctx() });
  expect(ruleCode(() => applyConfirmedDate({ batch: cancelled, shipments: [], receipts: [] }, {
    date: day('2026-11-01'),
    reason: '还想改',
    ctx: ctx({ nextId: deliveryBatchId('cancelled-date') }),
  }))).toBe('STATE_CONFLICT');
});

it('改计划数量会推进状态变更时间，承诺日改动要留下记录', () => {
  const base = openBatch();
  const partial = addReceipt({ records: base, input: { qty: 4, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx() });
  const later = '2026-10-12T01:00:00.000Z';
  const resized = updateBatchFields({ batch: partial.batch, patch: { plannedQty: 4 }, records: { ...partial, at: later, by: entityId('buyer-1'), nextId: deliveryBatchId('chg-qty') } });
  expect(resized.batch.status).toBe('received');
  expect(resized.batch.statusChangedAt).toBe(later);
  expect(resized.dateChange).toBeNull();
  const promised = updateBatchFields({ batch: base.batch, patch: { dateSupplierPromised: day('2026-10-18') }, records: { ...base, at: later, by: entityId('buyer-1'), nextId: deliveryBatchId('chg-sup') } });
  expect(promised.dateChange?.field).toBe('dateSupplierPromised');
  expect(promised.dateChange?.oldValue).toBeNull();
  expect(promised.batch.updatedAt).toBe(later);
});

it('手工批次可以改代工厂需求日，关闭或取消后不能再改、不能再关', () => {
  const batch = createBatch({
    orderLineId: orderLineId('line-1'), seq: 1, plannedQty: 2, receiverPartyId: entityId('recv-1'), origin: 'manual',
  }, ctx());
  const changed = updateBatchFields({ batch, patch: { dateFactoryRequired: day('2026-10-03') }, records: { shipments: [], receipts: [], at, by: entityId('buyer-1'), nextId: deliveryBatchId('chg-1') } });
  expect(changed.batch.dateFactoryRequired).toBe(day('2026-10-03'));
  const closed = closeBatch({ batch, shipments: [], receipts: [] }, { reason: '结束', ctx: ctx() });
  expect(() => updateBatchFields({ batch: closed, patch: { plannedQty: 3 }, records: { shipments: [], receipts: [], at, by: entityId('buyer-1'), nextId: deliveryBatchId('chg-2') } })).toThrow(DomainRuleViolation);
  expect(() => closeBatch({ batch: closed, shipments: [], receipts: [] }, { reason: '再关', ctx: ctx() })).toThrow(DomainRuleViolation);
  expect(() => cancelBatch({ batch: closed, shipments: [], receipts: [] }, { reason: '改取消', ctx: ctx() })).toThrow(DomainRuleViolation);
  expect(() => closeBatch(openBatch(), { reason: '   ', ctx: ctx() })).toThrow(DomainRuleViolation);
});

it('关闭或取消之后不能登记送货单、撤销发货或作废收货', () => {
  const shipped = addShipment({ records: openBatch(), input: { qty: 1, shippedOn: day('2026-10-11') }, ctx: ctx() });
  const received = addReceipt({ records: shipped, input: { qty: 1, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx({ nextId: deliveryBatchId('r1') }) });
  const closed = closeBatch(received, { reason: '结束', ctx: ctx() });
  const locked = { ...received, batch: closed };
  const shipmentId = locked.shipments[0]?.id ?? '';
  const receiptId = locked.receipts[0]?.id ?? '';
  expect(ruleCode(() => setDeliveryNote({ records: locked, input: { status: 'returned', date: day('2026-10-12') }, ctx: ctx({ nextId: deliveryBatchId('note-closed') }) }))).toBe('STATE_CONFLICT');
  expect(ruleCode(() => undoRecord(locked, { kind: 'shipment', recordId: shipmentId, ctx: ctx({ at: '2026-10-12T00:00:09.000Z' }) }))).toBe('STATE_CONFLICT');
  expect(ruleCode(() => voidRecord(locked, { kind: 'receipt', recordId: receiptId, reason: '登记错了', ctx: ctx({ at: '2026-10-12T00:00:20.000Z' }) }))).toBe('STATE_CONFLICT');
  const cancelled = cancelBatch(received, { reason: '客户取消', ctx: ctx() });
  const stopped = { ...received, batch: cancelled };
  expect(ruleCode(() => setDeliveryNote({ records: stopped, input: { status: 'returned', date: day('2026-10-12') }, ctx: ctx({ nextId: deliveryBatchId('note-cancelled') }) }))).toBe('STATE_CONFLICT');
  expect(locked.shipments[0]?.qty).toBe(1);
  expect(locked.receipts[0]?.qty).toBe(1);
});

it('取消后不能发货，重新打开按记录推导并清掉关闭原因', () => {
  const cancelled = cancelBatch(openBatch(), { reason: '客户取消', ctx: ctx() });
  expect(() => addShipment({ records: { ...openBatch(), batch: cancelled }, input: { qty: 1, shippedOn: day('2026-10-12') }, ctx: ctx() })).toThrow(DomainRuleViolation);
  const opened = reopenBatch({ batch: cancelled, shipments: [], receipts: [] }, { reason: '还要做', ctx: ctx({ at: '2026-10-12T00:00:30.000Z' }) });
  expect(opened.status).toBe('confirmed');
  expect(opened.closedReason).toBeNull();
  expect(opened.cancelReason).toBeNull();
  expect(() => reopenBatch(openBatch(), { reason: '没关', ctx: ctx() })).toThrow(DomainRuleViolation);
});

it('数量和序号非法、坏时间戳、重复作废都会拒绝', () => {
  expect(() => createBatch({ orderLineId: orderLineId('line-1'), seq: 0, plannedQty: 1, receiverPartyId: entityId('recv-1'), origin: 'manual' }, ctx())).toThrow(DomainRuleViolation);
  expect(() => createBatch({ orderLineId: orderLineId('line-1'), seq: 1, plannedQty: Number.NaN, receiverPartyId: entityId('recv-1'), origin: 'manual' }, ctx())).toThrow(DomainRuleViolation);
  const added = addShipment({ records: openBatch(), input: { qty: 1, shippedOn: day('2026-10-11') }, ctx: ctx() });
  const id = added.shipments[0]?.id ?? '';
  expect(() => undoRecord(added, { kind: 'shipment', recordId: id, ctx: ctx({ at: '不是时间' }) })).toThrow(DomainRuleViolation);
  const voided = voidRecord(added, { kind: 'shipment', recordId: id, reason: '登记错了', ctx: ctx({ at: '2026-10-12T00:00:20.000Z' }) });
  expect(() => voidRecord(voided, { kind: 'shipment', recordId: id, reason: '再作废', ctx: ctx({ at: '2026-10-12T00:00:30.000Z' }) })).toThrow(DomainRuleViolation);
  expect(() => voidRecord(added, { kind: 'shipment', recordId: id, reason: '别人的', ctx: ctx({ by: entityId('other'), at: '2026-10-12T00:00:20.000Z' }) })).toThrow(DomainRuleViolation);
});

it('管理员可以作废别人的记录，作废收货后若还有发货则回到已发货', () => {
  const shipped = addShipment({ records: openBatch(), input: { qty: 1, shippedOn: day('2026-10-11') }, ctx: ctx() });
  const received = addReceipt({ records: shipped, input: { qty: 10, receivedOn: day('2026-10-12'), category: 'finished' }, ctx: ctx({ nextId: deliveryBatchId('r1'), by: entityId('other') }) });
  const voided = voidRecord(received, {
    kind: 'receipt',
    recordId: received.receipts[0]?.id ?? '',
    reason: '登记错了',
    ctx: ctx({ isAdmin: true, at: '2026-10-12T00:00:20.000Z' }),
  });
  expect(voided.batch.status).toBe('shipped');
  expect(qtyVariance({ plannedQty: 10, receipts: voided.receipts })).toBe(-10);
});

it('采纳出货要有来源行，送货单可以带附件，作废后子状态是未回传', () => {
  expect(() => addShipment({ records: openBatch(), input: { qty: 1, shippedOn: day('2026-10-11'), source: 'factory_report_adopted' }, ctx: ctx() })).toThrow(DomainRuleViolation);
  const adopted = addShipment({ records: openBatch(), input: {
    qty: 2,
    shippedOn: day('2026-10-11'),
    source: 'factory_report_adopted',
    factoryShipmentRowId: entityId('row-9'),
  }, ctx: ctx() });
  expect(adopted.shipments[0]?.source).toBe('factory_report_adopted');
  expect(adopted.shipments[0]?.factoryShipmentRowId).toBe('row-9');
  const noted = setDeliveryNote({ records: openBatch(), input: { status: 'verified', date: day('2026-10-12'), fileId: entityId('file-1') }, ctx: ctx() });
  expect(noted.deliveryNote?.fileId).toBe('file-1');
  expect(noted.deliveryNote?.verifiedOn).toBe(day('2026-10-12'));
  const voided = voidRecord(noted, { kind: 'delivery_note', recordId: noted.deliveryNote?.id ?? '', reason: '传错了', ctx: ctx({ at: '2026-10-12T00:00:20.000Z' }) });
  expect(noteStatus(voided.deliveryNote)).toBe('missing');
  expect(() => setDeliveryNote({ records: voided, input: { status: 'returned', date: day('2026-10-13') }, ctx: ctx({ nextId: deliveryBatchId('note-2') }) })).toThrow(DomainRuleViolation);
  expect(deriveBatchStatus({ ...voided.batch, receipts: [], shipments: [{ voidedAt: at }] })).toBe('confirmed');
});
