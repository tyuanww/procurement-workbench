import { entityId, orderLineId, type OrderLineId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { makeAddFollowUp } from '../../packages/application/src/follow-up/use-cases/add-follow-up.js';
import { makeAddFollowUps } from '../../packages/application/src/follow-up/use-cases/add-follow-ups.js';
import { makeCloseException } from '../../packages/application/src/follow-up/use-cases/close-exception.js';
import { makeCreateBatch } from '../../packages/application/src/follow-up/use-cases/create-batch.js';
import { makeOpenException } from '../../packages/application/src/follow-up/use-cases/open-exception.js';
import { makeUndoRecord } from '../../packages/application/src/follow-up/use-cases/undo-record.js';
import type { AddFollowUpInput } from '../../packages/application/src/follow-up/views.js';
import {
  ForbiddenError,
  NotFoundError,
  StateConflictError,
  UndoNotOwnerError,
  UndoWindowExpiredError,
  ValidationFailedError,
} from '../../packages/application/src/shared/errors.js';
import {
  anActor,
  anOrderLine,
  createMemory,
  FixedClock,
  SequentialIds,
} from '../../packages/testkit/src/index.js';

const BULK_LIMIT = 100;

function app() {
  const memory = createMemory();
  const clock = new FixedClock('2026-10-12T00:00:00.000Z');
  const ids = new SequentialIds();
  const write = { uow: memory.unitOfWork, clock, ids };
  return {
    memory,
    clock,
    add: makeAddFollowUp(write),
    addMany: makeAddFollowUps(write),
    open: makeOpenException(write),
    close: makeCloseException(write),
    undo: makeUndoRecord(write),
    createBatch: makeCreateBatch(write),
  };
}

function followUpInput(orderLineId: OrderLineId, text = '已电话'): AddFollowUpInput {
  return { orderLineId, kind: 'call', text };
}

it('跟进记录不能改，再追加一条不会覆盖上一条', async () => {
  const box = app();
  const buyer = anActor('buyer');
  const line = anOrderLine();
  await box.memory.stores.orderLines.save(line);
  await expect(box.add(followUpInput(line.id, '  '), anActor('reviewer'))).rejects.toBeInstanceOf(
    ForbiddenError,
  );
  await expect(box.add(followUpInput(line.id, '  '), buyer)).rejects.toBeInstanceOf(ValidationFailedError);
  const first = await box.add(followUpInput(line.id, ' 已电话 '), buyer);
  const second = await box.add(followUpInput(line.id, '再问一次'), buyer);
  const rows = [...box.memory.box.current.followUps.values()];
  expect(rows.find((row) => row.id === first.followUpId)?.text).toBe('已电话');
  expect(rows.find((row) => row.id === second.followUpId)?.text).toBe('再问一次');
  expect(box.memory.box.current.audit.map((entry) => entry.action)).toEqual([
    'follow_up.create',
    'follow_up.create',
  ]);
});

it('跟进记录 10 秒内本人能撤销，第 11 秒或别人不行', async () => {
  const box = app();
  const buyer = anActor('buyer');
  const line = anOrderLine();
  await box.memory.stores.orderLines.save(line);
  const created = await box.add(followUpInput(line.id), buyer);
  await expect(
    box.undo({ kind: 'follow_up', recordId: created.followUpId }, anActor('buyer')),
  ).rejects.toBeInstanceOf(UndoNotOwnerError);
  box.clock.advance(10);
  await box.undo({ kind: 'follow_up', recordId: created.followUpId }, buyer);
  expect(box.memory.box.current.followUps.has(created.followUpId)).toBe(false);
  const later = await box.add(followUpInput(line.id, '超时'), buyer);
  box.clock.advance(11);
  await expect(
    box.undo({ kind: 'follow_up', recordId: later.followUpId }, buyer),
  ).rejects.toBeInstanceOf(UndoWindowExpiredError);
  expect(box.memory.box.current.followUps.has(later.followUpId)).toBe(true);
});

it('一次最多追加 100 条跟进，超出或中途不合法就一条不留', async () => {
  const box = app();
  const buyer = anActor('buyer');
  const line = anOrderLine();
  await box.memory.stores.orderLines.save(line);
  const items = Array.from({ length: BULK_LIMIT }, () => followUpInput(line.id));
  await expect(box.addMany({ items: [...items, followUpInput(line.id)] }, buyer)).rejects.toBeInstanceOf(
    ValidationFailedError,
  );
  expect(box.memory.box.current.followUps.size).toBe(0);
  await expect(
    box.addMany({ items: [followUpInput(line.id), followUpInput(line.id, ' ')] }, buyer),
  ).rejects.toBeInstanceOf(ValidationFailedError);
  expect(box.memory.box.current.followUps.size).toBe(0);
  const created = await box.addMany({ items }, buyer);
  expect(created.created).toBe(BULK_LIMIT);
  expect(box.memory.box.current.followUps.size).toBe(BULK_LIMIT);
});

it('跟进和异常不能挂到不存在的行，也不能挂到别的订单行的批次', async () => {
  const box = app();
  const buyer = anActor('buyer');
  const line = anOrderLine();
  const other = anOrderLine();
  await box.memory.stores.orderLines.save(line);
  await box.memory.stores.orderLines.save(other);
  const batch = await box.createBatch(
    { lineId: other.id, plannedQty: 1, receiverPartyId: entityId('recv-1') },
    buyer,
  );
  await expect(box.add(followUpInput(orderLineId('missing')), buyer)).rejects.toBeInstanceOf(NotFoundError);
  await expect(box.add({ ...followUpInput(line.id), batchId: batch.batchId }, buyer)).rejects.toBeInstanceOf(
    ValidationFailedError,
  );
  await expect(
    box.add({ ...followUpInput(line.id), partyId: entityId('missing-party') }, buyer),
  ).rejects.toBeInstanceOf(NotFoundError);
  await expect(
    box.open({ orderLineId: line.id, batchId: batch.batchId, type: 'delay', note: '延期' }, buyer),
  ).rejects.toBeInstanceOf(ValidationFailedError);
  expect(box.memory.box.current.followUps.size).toBe(0);
  expect(box.memory.box.current.exceptions.size).toBe(0);
});

it('跟进和异常可以挂在本订单行的批次上', async () => {
  const box = app();
  const buyer = anActor('buyer');
  const line = anOrderLine();
  await box.memory.stores.orderLines.save(line);
  const batch = await box.createBatch(
    { lineId: line.id, plannedQty: 1, receiverPartyId: entityId('recv-1') },
    buyer,
  );
  const created = await box.add({ ...followUpInput(line.id), batchId: batch.batchId }, buyer);
  const opened = await box.open(
    { orderLineId: line.id, batchId: batch.batchId, type: 'delay', note: '延期' },
    buyer,
  );
  expect((await box.memory.stores.followUps.get(created.followUpId)).batchId).toBe(batch.batchId);
  expect((await box.memory.stores.exceptions.get(opened.exceptionId)).batchId).toBe(batch.batchId);
});

it('异常说明必填，关闭后再关被拒绝，关闭留审计', async () => {
  const box = app();
  const buyer = anActor('buyer');
  const line = anOrderLine();
  await box.memory.stores.orderLines.save(line);
  await expect(
    box.open({ orderLineId: line.id, type: 'quality', note: ' ' }, buyer),
  ).rejects.toBeInstanceOf(ValidationFailedError);
  const opened = await box.open({ orderLineId: line.id, type: 'quality', note: ' 漏液 ' }, buyer);
  const row = await box.memory.stores.exceptions.get(opened.exceptionId);
  expect(row.status).toBe('open');
  expect(row.note).toBe('漏液');
  const closed = await box.close({ exceptionId: entityId(opened.exceptionId), closeNote: '已补货' }, buyer);
  expect((await box.memory.stores.exceptions.get(closed.exceptionId)).status).toBe('closed');
  await expect(
    box.close({ exceptionId: entityId(opened.exceptionId), closeNote: '再关一次' }, buyer),
  ).rejects.toBeInstanceOf(StateConflictError);
  expect(box.memory.box.current.audit.map((entry) => entry.action)).toEqual([
    'exception.open',
    'exception.close',
  ]);
});
