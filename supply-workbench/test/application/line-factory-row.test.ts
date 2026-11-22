import { expect, it } from 'vitest';
import type { LineFactoryLink, LineFactoryLinkStatus } from '../../packages/domain/src/index.js';
import type { OrderLineDetail } from '../../packages/application/src/follow-up/views.js';
import { entityId, orderLineId } from '../../packages/domain/src/index.js';
import {
  createDb, followUpQueries, lineFactoryLinkRepository, migrate, orderLineRepository, partyRepository, purchaseOrderRepository,
} from '../../packages/persistence/src/index.js';
import { aParty, aPurchaseOrder, anOrderLine, FixedClock } from '../../packages/testkit/src/index.js';

const AT = '2026-11-09T02:00:00.000Z';
const CLOCK = new FixedClock(AT);

it('列表行按已关联/手工关联给工厂，未关联和没有关联记录都是 null', async () => {
  const linked = await mappedFactory('linked');
  expect(linked.factory).toEqual({ id: 'factory-1', displayName: '甲代工厂' });
  const manual = await mappedFactory('manual');
  expect(manual.factory).toEqual({ id: 'factory-1', displayName: '甲代工厂' });
  const unlinked = await mappedFactory('unlinked');
  expect(unlinked.factory).toBeNull();
  const missing = await mappedFactory(null);
  expect(missing.factory).toBeNull();
});

it('详情行也带同一个工厂，预览抽屉不用再查一遍', async () => {
  const factory = await mappedDetailFactory('linked');
  expect(factory).toEqual({ id: 'factory-1', displayName: '甲代工厂' });
  expect(await mappedDetailFactory('unlinked')).toBeNull();
});

async function mappedFactory(status: LineFactoryLinkStatus | null) {
  const handle = await open(status);
  const listed = await followUpQueries({ db: handle.db, clock: CLOCK, timeZone: 'Asia/Shanghai' }).list({ lane: 'finished', page: 1, pageSize: 50 });
  const row = listed.items[0];
  if (row === undefined) throw new Error('没有读到订单行');
  const factory = row.factory;
  await handle.close();
  return { factory };
}

async function mappedDetailFactory(status: LineFactoryLinkStatus | null): Promise<OrderLineDetail['line']['factory']> {
  const handle = await open(status);
  const detail = await followUpQueries({ db: handle.db, clock: CLOCK, timeZone: 'Asia/Shanghai' }).getDetail(orderLineId('line-1'));
  const factory = detail.line.factory;
  await handle.close();
  return factory;
}

async function open(status: LineFactoryLinkStatus | null) {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  const factory = aParty({ id: entityId('factory-1'), displayName: '甲代工厂', isFactory: true, isSupplier: false });
  await partyRepository(handle.db).save(factory);
  const order = aPurchaseOrder({ id: entityId('po-1'), supplierPartyId: null });
  await purchaseOrderRepository(handle.db).save(order);
  await orderLineRepository(handle.db).save(anOrderLine({ id: orderLineId('line-1'), purchaseOrderId: order.id, lane: 'finished' }));
  if (status !== null) await lineFactoryLinkRepository(handle.db).save(link(status));
  return handle;
}

function link(status: LineFactoryLinkStatus): LineFactoryLink {
  return {
    id: entityId('link-1'),
    createdAt: AT,
    updatedAt: AT,
    orderLineId: orderLineId('line-1'),
    factoryPartyId: status === 'unlinked' ? null : entityId('factory-1'),
    status,
    source: status === 'manual' ? 'manual' : 'relink',
    confidence: status === 'manual' ? 'manual' : 'po',
    poRaw: 'PO202610120001',
    itemCodeRaw: null,
    barcodeRaw: null,
    reason: null,
    linkedAt: AT,
  };
}
