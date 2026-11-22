import { entityId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { DomainRuleViolation } from '../../packages/domain/src/errors.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import { makeCloseBatch } from '../../packages/application/src/follow-up/use-cases/close-batch.js';
import { makeCreateBatch } from '../../packages/application/src/follow-up/use-cases/create-batch.js';
import { makeCreateLine } from '../../packages/application/src/follow-up/use-cases/create-line.js';
import { makeRecordDeliveryNote } from '../../packages/application/src/follow-up/use-cases/record-delivery-note.js';
import { makeRecordReceipt } from '../../packages/application/src/follow-up/use-cases/record-receipt.js';
import { makeRecordShipment } from '../../packages/application/src/follow-up/use-cases/record-shipment.js';
import { makeUndoRecord } from '../../packages/application/src/follow-up/use-cases/undo-record.js';
import { makeUpdateBatch } from '../../packages/application/src/follow-up/use-cases/update-batch.js';
import { makeUpdateLine } from '../../packages/application/src/follow-up/use-cases/update-line.js';
import { makeVoidRecord } from '../../packages/application/src/follow-up/use-cases/void-record.js';
import { ForbiddenError } from '../../packages/application/src/shared/errors.js';
import { anActor, anOrderLine, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';

const day = localDate;

function app() {
  const memory = createMemory();
  const clock = new FixedClock('2026-10-12T00:00:00.000Z');
  const ids = new SequentialIds();
  const write = { uow: memory.unitOfWork, clock, ids };
  return {
    memory,
    clock,
    createLine: makeCreateLine(write),
    updateLine: makeUpdateLine(write),
    createBatch: makeCreateBatch(write),
    updateBatch: makeUpdateBatch(write),
    closeBatch: makeCloseBatch(write),
    ship: makeRecordShipment(write),
    receive: makeRecordReceipt(write),
    note: makeRecordDeliveryNote({ ...write, files: memory.files }),
    undo: makeUndoRecord(write),
    voidRecord: makeVoidRecord(write),
  };
}

it('导入行不能改品名，手工行可以，写入都留审计', async () => {
  const box = app();
  const admin = anActor('buyer');
  await expect(box.createLine({ lane: 'finished', nameRaw: '海葡萄', qtyOrdered: 10, receiverPartyId: entityId('recv-1') }, anActor('reviewer'))).rejects.toBeInstanceOf(ForbiddenError);
  const created = await box.createLine({ lane: 'finished', nameRaw: '海葡萄', qtyOrdered: 10, receiverPartyId: entityId('recv-1') }, admin);
  const imported = anOrderLine({ origin: 'import_po_master', nameRaw: '原名', qtyOrdered: 8 });
  await box.memory.stores.orderLines.save(imported);
  await expect(box.updateLine({ lineId: imported.id, nameRaw: '改名' }, admin)).rejects.toBeInstanceOf(DomainRuleViolation);
  await box.updateLine({ lineId: created.lineId, nameRaw: '新名' }, admin);
  expect((await box.memory.stores.orderLines.get(created.lineId)).nameRaw).toBe('新名');
  expect(box.memory.box.current.audit.map((entry) => entry.action)).toContain('line.create');
  expect(box.memory.box.current.audit.map((entry) => entry.action)).toContain('line.update');
});

it('首次确认日不变，不写原因不能改，关闭后不能再发货', async () => {
  const box = app();
  const buyer = anActor('buyer');
  const line = anOrderLine();
  await box.memory.stores.orderLines.save(line);
  const created = await box.createBatch({
    lineId: line.id, plannedQty: 10, receiverPartyId: entityId('recv-1'), dateBuyerConfirmed: day('2026-10-20'),
  }, buyer);
  await expect(box.updateBatch({ batchId: created.batchId, dateBuyerConfirmed: day('2026-10-21') }, buyer)).rejects.toBeInstanceOf(DomainRuleViolation);
  await box.updateBatch({ batchId: created.batchId, dateBuyerConfirmed: day('2026-10-21'), reason: '工厂延后' }, buyer);
  expect((await box.memory.stores.batches.get(created.batchId)).firstConfirmedDate).toBe(day('2026-10-20'));
  await box.closeBatch({ batchId: created.batchId, reason: '结束' }, buyer);
  await expect(box.ship({ batchId: created.batchId, qty: 1, shippedOn: day('2026-10-18') }, buyer)).rejects.toBeInstanceOf(DomainRuleViolation);
});

it('第 11 秒不能撤销，作废收货后状态回到已发货，送货单附件能读回', async () => {
  const box = app();
  const buyer = anActor('buyer');
  const line = anOrderLine();
  await box.memory.stores.orderLines.save(line);
  const created = await box.createBatch({ lineId: line.id, plannedQty: 10, receiverPartyId: entityId('recv-1'), dateBuyerConfirmed: day('2026-10-20') }, buyer);
  const shipped = await box.ship({ batchId: created.batchId, qty: 1, shippedOn: day('2026-10-18') }, buyer);
  const received = await box.receive({ batchId: created.batchId, qty: 10, receivedOn: day('2026-10-19'), category: 'finished' }, buyer);
  box.clock.advance(11);
  await expect(box.undo({ kind: 'receipt', recordId: received.receiptId }, buyer)).rejects.toBeInstanceOf(DomainRuleViolation);
  await box.voidRecord({ kind: 'receipt', recordId: received.receiptId, reason: '登记错了' }, buyer);
  expect((await box.memory.stores.batches.get(created.batchId)).status).toBe('shipped');
  const bytes = new Uint8Array([9, 8, 7]);
  const noted = await box.note({ batchId: created.batchId, status: 'returned', date: day('2026-10-19'), file: { bytes, fileName: 'note.pdf', mime: 'application/pdf' } }, buyer);
  const stored = [...box.memory.box.current.deliveryNotes.values()].find((row) => row.id === noted.deliveryNoteId);
  expect(stored?.fileId).toBeTruthy();
  expect(await box.memory.files.read(stored?.fileId ?? '')).toEqual(bytes);
  expect(shipped.shipmentId).toBeTruthy();
});
