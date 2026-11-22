import { entityId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import type { FactoryReportRow } from '../../packages/domain/src/entities/records.js';
import { localDate } from '../../packages/domain/src/values/local-date.js';
import { makeAdoptFactoryShipment } from '../../packages/application/src/follow-up/use-cases/adopt-factory-shipment.js';
import { makeCreateBatch } from '../../packages/application/src/follow-up/use-cases/create-batch.js';
import { makeCreateLineFromInTransit } from '../../packages/application/src/follow-up/use-cases/create-line-from-in-transit.js';
import { makeGenerateBatchesFromDemand } from '../../packages/application/src/follow-up/use-cases/generate-batches-from-demand.js';
import { StateConflictError } from '../../packages/application/src/shared/errors.js';
import {
  anActor,
  anOrderLine,
  aUser,
  createMemory,
  FixedClock,
  SequentialIds,
} from '../../packages/testkit/src/index.js';

const day = localDate;

function app() {
  const memory = createMemory();
  const clock = new FixedClock('2026-10-12T00:00:00.000Z');
  const ids = new SequentialIds();
  const write = { uow: memory.unitOfWork, clock, ids };
  return {
    memory,
    generate: makeGenerateBatchesFromDemand(write),
    adopt: makeAdoptFactoryShipment(write),
    createLine: makeCreateLineFromInTransit(write),
    createBatch: makeCreateBatch(write),
  };
}

function report(overrides: Partial<FactoryReportRow>): FactoryReportRow {
  return {
    id: entityId('row-1'),
    importBatchId: entityId('import-1'),
    factoryPartyId: entityId('factory-1'),
    sheetName: '需求表',
    rowNo: 4,
    raw: {},
    fingerprint: 'fp-1',
    linkedOrderLineId: null,
    linkStatus: 'unlinked',
    linkReason: null,
    kind: 'demand',
    shipment: null,
    demand: null,
    inTransit: null,
    ...overrides,
  };
}

it('同一个需求行生成两次批次，第二次全部跳过', async () => {
  const box = app();
  const buyer = anActor('buyer');
  const row = report({
    demand: {
      role: 'material',
      blockMaterialPoRaw: '3500-202609700002',
      poNorm: '3500-202609700002',
      itemCodeRaw: '30037001',
      nameRaw: '泵头',
      slots: [
        { index: 0, date: day('2026-09-20'), qty: 10 },
        { index: 1, date: null, qty: 5 },
      ],
    },
  });
  await box.memory.stores.factoryReports.save(row);
  const first = await box.generate({ rowIds: [row.id] }, buyer);
  expect(first).toEqual({ createdLines: 1, createdBatches: 1, skipped: [] });
  const second = await box.generate({ rowIds: [row.id] }, buyer);
  expect(second.createdLines).toBe(0);
  expect(second.createdBatches).toBe(0);
  expect(second.skipped).toEqual([{ rowId: row.id, slotIndex: 0, reason: '已经生成过批次' }]);
  const batch = [...box.memory.box.current.batches.values()][0];
  expect(batch?.origin).toBe('from_factory_demand');
  expect(batch?.originRef).toEqual({ rowId: row.id, slotIndex: 0 });
  expect(batch?.dateBuyerConfirmed).toBeNull();
  expect(batch?.dateFactoryRequired).toBe(day('2026-09-20'));
  expect(batch?.plannedQty).toBe(10);
  expect(batch?.receiverPartyId).toBe('factory-1');
});

it('采纳出货行生成的发货记录来源是代工厂上报', async () => {
  const box = app();
  const buyer = anActor('buyer');
  const line = anOrderLine();
  await box.memory.stores.orderLines.save(line);
  const created = await box.createBatch(
    {
      lineId: line.id,
      plannedQty: 10,
      receiverPartyId: entityId('recv-1'),
      dateBuyerConfirmed: day('2026-10-20'),
    },
    buyer,
  );
  const row = report({
    id: entityId('ship-1'),
    kind: 'shipment',
    sheetName: '成品出货明细',
    shipment: { qty: 12, shipOrArriveOn: day('2026-10-01') },
  });
  await box.memory.stores.factoryReports.save(row);
  const adopted = await box.adopt({ rowId: row.id, batchId: created.batchId }, buyer);
  const shipment = [...box.memory.box.current.shipments.values()].find(
    (item) => item.id === adopted.shipmentId,
  );
  expect(shipment?.source).toBe('factory_report_adopted');
  expect(shipment?.factoryShipmentRowId).toBe(row.id);
  expect(shipment?.qty).toBe(12);
  expect(shipment?.shippedOn).toBe(day('2026-10-01'));
  await expect(
    box.adopt({ rowId: row.id, batchId: created.batchId, qty: 1 }, buyer),
  ).rejects.toBeInstanceOf(StateConflictError);
});

it('从在途行新建订单行，并挂上这条上报', async () => {
  const box = app();
  const buyer = anActor('buyer');
  await box.memory.stores.users.save(aUser({ id: buyer.id }));
  const settings = await box.memory.stores.settings.get();
  await box.memory.stores.settings.save({ ...settings, ownWarehousePartyId: entityId('wh-1') });
  const row = report({
    id: entityId('transit-1'),
    kind: 'in_transit',
    sheetName: '在途订单汇总',
    inTransit: {
      poRaw: 'PO20260827000032',
      poNorm: 'PO20260827000032',
      nameRaw: '海葡萄',
      itemCodeRaw: '70007022',
      barcodeRaw: null,
      qtyRequired: 18,
    },
  });
  await box.memory.stores.factoryReports.save(row);
  await expect(box.createLine({ rowId: row.id, buyerUserId: entityId('未注册采购') }, buyer)).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  expect((await box.memory.stores.factoryReports.get(row.id)).linkedOrderLineId).toBeNull();
  const created = await box.createLine({ rowId: row.id, buyerUserId: buyer.id }, buyer);
  const line = await box.memory.stores.orderLines.get(created.lineId);
  expect(line.origin).toBe('from_factory_in_transit');
  expect(line.nameRaw).toBe('海葡萄');
  expect(line.qtyOrdered).toBe(18);
  expect(line.receiverPartyId).toBe('wh-1');
  expect(line.buyerUserId).toBe(buyer.id);
  expect((await box.memory.stores.factoryReports.get(row.id)).linkStatus).toBe('manual');
  expect((await box.memory.stores.factoryReports.get(row.id)).linkedOrderLineId).toBe(
    created.lineId,
  );
  await expect(box.createLine({ rowId: row.id }, buyer)).rejects.toBeInstanceOf(StateConflictError);
});
