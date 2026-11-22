import { deliveryBatchId, entityId, orderLineId, type DeliveryBatchId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { DomainRuleViolation } from '../../packages/domain/src/errors.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import {
  addReceipt,
  addShipment,
  applyConfirmedDate,
  cancelBatch,
  closeBatch,
  createBatch,
  type RuleContext,
} from '../../packages/domain/src/batch/change.js';
import { daysInStage, projectLine, updateLine, cancelLine, reopenLine, assignBuyer } from '../../packages/domain/src/line/index.js';
import { assertWritable } from '../../packages/domain/src/ownership/index.js';
import type { OrderLine } from '../../packages/domain/src/entities/orders.js';

const day = localDate;
const at = '2026-10-12T00:00:00.000Z';

function ctx(over: Partial<RuleContext<DeliveryBatchId>> = {}): RuleContext<DeliveryBatchId> {
  return { at, by: entityId('buyer-1'), isAdmin: false, nextId: deliveryBatchId('new-1'), ...over };
}

function line(over: Partial<OrderLine> = {}): OrderLine {
  return {
    id: orderLineId('line-1'),
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    purchaseOrderId: entityId('po-1'),
    lane: 'finished',
    itemId: null,
    itemCodeRaw: null,
    barcodeRaw: null,
    nameRaw: '海葡萄水光冰冰贴',
    qtyOrdered: 10,
    unit: null,
    buyerUserId: null,
    receiverPartyId: entityId('recv-1'),
    origin: 'manual',
    currentSnapshotId: null,
    candidateKey: null,
    missingInLatestImport: false,
    cancelledAt: null,
    cancelReason: null,
    stage: 'no_batch',
    stageChangedAt: '2026-10-01T00:00:00.000Z',
    nextDueBatchId: null,
    nextDueDate: null,
    ...over,
  };
}

it('没有批次时阶段是未建要货，卡住的起点是订单行创建日', () => {
  const created = line();
  const projected = projectLine(created, []);
  expect(projected.stage).toBe('no_batch');
  expect(projected.stageChangedAt).toBe(created.createdAt);
  expect(projected.nextDueBatchId).toBeNull();
  expect(projected.nextDueDate).toBeNull();
  expect(daysInStage({ stageChangedAt: projected.stageChangedAt, today: day('2026-10-12'), timeZone: 'Asia/Shanghai' })).toBe(11);
});

it('加批次、确认日期、发货、收货、关闭后四个投影字段都对', () => {
  const created = line();
  const awaiting = createBatch({
    orderLineId: created.id, seq: 1, plannedQty: 10, receiverPartyId: entityId('recv-1'), origin: 'manual',
  }, ctx());
  expect(projectLine(created, [awaiting])).toEqual({
    stage: 'awaiting_date',
    stageChangedAt: awaiting.statusChangedAt,
    nextDueBatchId: awaiting.id,
    nextDueDate: null,
  });
  const confirmed = applyConfirmedDate({ batch: awaiting, shipments: [], receipts: [] }, {
    date: day('2026-10-20'),
    reason: null,
    ctx: ctx({ nextId: deliveryBatchId('chg-1') }),
  }).batch;
  expect(projectLine(created, [confirmed]).stage).toBe('awaiting_shipment');
  expect(projectLine(created, [confirmed]).nextDueDate).toBe(day('2026-10-20'));
  const shipped = addShipment({ records: { batch: confirmed, shipments: [], receipts: [], deliveryNote: null }, input: {
    qty: 1, shippedOn: day('2026-10-18'),
  }, ctx: ctx({ nextId: deliveryBatchId('ship-1'), at: '2026-10-18T00:00:00.000Z' }) });
  expect(projectLine(created, [shipped.batch]).stage).toBe('awaiting_receipt');
  const partial = addReceipt({ records: shipped, input: { qty: 4, receivedOn: day('2026-10-19'), category: 'finished' }, ctx: ctx({ nextId: deliveryBatchId('r1'), at: '2026-10-19T00:00:00.000Z' }) });
  expect(projectLine(created, [partial.batch]).stage).toBe('partially_received');
  const closed = closeBatch(partial, { reason: '尾数不再送', ctx: ctx({ at: '2026-10-21T00:00:00.000Z' }) });
  expect(projectLine(created, [closed])).toEqual({
    stage: 'done',
    stageChangedAt: '2026-10-21T00:00:00.000Z',
    nextDueBatchId: null,
    nextDueDate: null,
  });
});

it('确认到货日为空的批次排在最后，同日按序号', () => {
  const dated = createBatch({
    orderLineId: orderLineId('line-1'), seq: 2, plannedQty: 1, receiverPartyId: entityId('recv-1'), origin: 'manual', dateBuyerConfirmed: day('2026-10-20'),
  }, ctx({ nextId: deliveryBatchId('late') }));
  const missing = createBatch({
    orderLineId: orderLineId('line-1'), seq: 1, plannedQty: 1, receiverPartyId: entityId('recv-1'), origin: 'manual',
  }, ctx({ nextId: deliveryBatchId('missing') }));
  const earlier = createBatch({
    orderLineId: orderLineId('line-1'), seq: 9, plannedQty: 1, receiverPartyId: entityId('recv-1'), origin: 'manual', dateBuyerConfirmed: day('2026-10-15'),
  }, ctx({ nextId: deliveryBatchId('early') }));
  expect(projectLine(line(), [missing, dated, earlier]).nextDueBatchId).toBe(earlier.id);
  expect(projectLine(line(), [missing, dated]).nextDueBatchId).toBe(dated.id);
});

it('订单行自己取消优先于批次；批次全取消则回到未建要货', () => {
  const batch = createBatch({
    orderLineId: orderLineId('line-1'), seq: 1, plannedQty: 1, receiverPartyId: entityId('recv-1'), origin: 'manual', dateBuyerConfirmed: day('2026-10-20'),
  }, ctx());
  const cancelledBatch = cancelBatch({ batch, shipments: [], receipts: [] }, { reason: '不要了', ctx: ctx() });
  expect(projectLine(line(), [cancelledBatch]).stage).toBe('no_batch');
  const cancelledLine = cancelLine(line(), { reason: '客户取消', at: '2026-10-12T02:00:00.000Z' });
  expect(projectLine(cancelledLine, [batch]).stage).toBe('cancelled');
  expect(cancelledLine.stageChangedAt).toBe('2026-10-12T02:00:00.000Z');
  const reopened = reopenLine({ line: cancelledLine, batches: [batch], input: { reason: '还要做', at: '2026-10-12T03:00:00.000Z' } });
  expect(reopened.stage).toBe('awaiting_shipment');
  expect(reopened.cancelledAt).toBeNull();
  expect(reopened.cancelReason).toBeNull();
});

it('导入行不能改品名或数量，手工行可以，负责人两边都能改', () => {
  const imported = line({ origin: 'import_po_master' });
  expect(() => updateLine({ line: imported, patch: { nameRaw: '改名' }, at })).toThrow(DomainRuleViolation);
  expect(() => updateLine({ line: imported, patch: { qtyOrdered: 3 }, at })).toThrow(DomainRuleViolation);
  expect(() => assertWritable({ entity: 'order_line', fields: ['firstDeliveryOn'], origin: 'import_po_master' })).toThrow(DomainRuleViolation);
  const renamed = updateLine({ line: imported, patch: { buyerUserId: entityId('buyer-2') }, at });
  expect(renamed.buyerUserId).toBe('buyer-2');
  expect(renamed.nameRaw).toBe(imported.nameRaw);
  const manual = updateLine({ line: line(), patch: { nameRaw: '改名', qtyOrdered: 3 }, at });
  expect(manual.nameRaw).toBe('改名');
  expect(manual.qtyOrdered).toBe(3);
  expect(assignBuyer({ line: imported, buyerUserId: null, at }).buyerUserId).toBeNull();
});

it('归属表：上报只读，需求表生成的代工厂需求日只读，产品看字段来源', () => {
  expect(() => assertWritable({ entity: 'factory_report', fields: ['qty'], origin: 'factory_report' })).toThrow(DomainRuleViolation);
  expect(() => assertWritable({ entity: 'delivery_batch', fields: ['dateFactoryRequired'], origin: 'from_factory_demand' })).toThrow(DomainRuleViolation);
  expect(() => assertWritable({ entity: 'delivery_batch', fields: ['plannedQty'], origin: 'from_factory_demand' })).not.toThrow();
  expect(() => assertWritable({ entity: 'delivery_batch', fields: ['dateFactoryRequired'], origin: 'manual' })).not.toThrow();
  expect(() => assertWritable({ entity: 'party', fields: ['nameRaw'], origin: 'import' })).not.toThrow();
  expect(() => assertWritable({ entity: 'item', fields: ['nameRaw'], origin: 'import' })).not.toThrow();
  expect(() => assertWritable({ entity: 'product', fields: ['skuName'], origin: 'import' })).toThrow(DomainRuleViolation);
  expect(() => assertWritable({ entity: 'product', fields: ['skuName'], origin: 'workbench' })).not.toThrow();
  expect(() => updateLine({ line: line(), patch: { qtyOrdered: 0 }, at })).toThrow(DomainRuleViolation);
  expect(() => cancelLine(line(), { reason: '  ', at })).toThrow(DomainRuleViolation);
  expect(() => reopenLine({ line: line(), batches: [], input: { reason: '没取消', at } })).toThrow(DomainRuleViolation);
});
