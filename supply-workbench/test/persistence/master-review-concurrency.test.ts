import { expect, it } from 'vitest';
import { makeBulkCreateItems, makeResolveMultiName } from '../../packages/application/src/master-data/index.js';
import { entityId, type EntityId, type ItemCode } from '../../packages/domain/src/index.js';
import {
  auditRepository, codeLinkRepository, createUnitOfWork, factoryReportRepository, itemCodeRepository,
  itemNameRepository, itemRepository, orderLineRepository, placeholderStores, purchaseOrderRepository,
  requireDatabase, deliveryBatchRepository, type AppDatabase,
} from '../../packages/persistence/src/index.js';
import { aFactoryStockRow, anItem } from '../../packages/testkit/src/index.js';
import { blockedOnPostgres, clock, gate, seedLine, settled, url, wait, withFixture } from './factory-demand-generation-fixture.js';

type Fixture = Parameters<Parameters<typeof withFixture>[0]>[0];

it.skipIf(url === undefined)('PostgreSQL 按品号及条码并发重联同一在途行时使用已提交的审核决定', async () => {
  await withReviewFixture(async (fixture, keys) => {
    const { main, competing, sample } = fixture;
    const codes = [
      reviewCode({ id: keys.left, codeRaw: sample.code, itemId: keys.firstItem }),
      reviewCode({ id: keys.right, codeRaw: `BARCODE-${sample.id}`, itemId: keys.secondItem, codeType: 'barcode_69' }),
    ] as const;
    await seedReviewLine({ fixture, codes });
    const reports = factoryReportRepository(main.db);
    const rowId = entityId(`0-${sample.id}-report`);
    const { poNorm } = await purchaseOrderRepository(main.db).get(sample.orderId);
    await reports.save(aFactoryStockRow({
      id: rowId, importBatchId: sample.importId, factoryPartyId: sample.factoryId, fingerprint: rowId, kind: 'in_transit',
      inTransit: { poRaw: sample.poRaw, poNorm, nameRaw: '工厂不同名', itemCodeRaw: codes[0].codeRaw, barcodeRaw: codes[1].codeRaw, qtyRequired: 50 },
    }));
    const paused = gate();
    const first = makeResolveMultiName(reviewWrites(main.db, { nextId: keys.firstItem, afterAudit: paused.hold }));
    const second = makeResolveMultiName(reviewWrites(competing.db, { nextId: keys.secondItem }));
    const receipt = await overlap(fixture, {
      paused,
      first: () => first({ codeId: codes[0].id, mode: 'same_item', displayName: '工厂不同名' }, sample.reviewer),
      second: () => second({ codeId: codes[1].id, mode: 'shared_code' }, sample.reviewer),
    });
    expect(receipt).toEqual({ codeId: codes[1].id });
    expect(await reports.get(rowId)).toMatchObject({ linkStatus: 'linked', linkedOrderLineId: sample.lineId, linkReason: null });
    expect(await itemNameRepository(main.db).decision(keys.firstItem)).toBe('same_item');
  });
}, 15000);

it.skipIf(url === undefined)('PostgreSQL 批量建物料和一号多名审核并发时使用同一物料归属', async () => {
  await withReviewFixture(async (fixture, keys) => {
    const { main, competing, sample } = fixture;
    const code = reviewCode({ id: keys.left, codeRaw: sample.code, itemId: null });
    await seedLine({ db: main.db, sample, id: sample.lineId });
    const codes = itemCodeRepository(main.db);
    await codes.save(code);
    const paused = gate();
    const resolve = makeResolveMultiName(reviewWrites(main.db, { nextId: keys.firstItem, afterAudit: paused.hold }));
    const bulk = makeBulkCreateItems(reviewWrites(competing.db, { nextId: keys.secondItem }));
    const receipt = await overlap(fixture, {
      paused,
      first: () => resolve({ codeId: code.id, mode: 'same_item', displayName: '审核统一名称' }, sample.reviewer),
      second: () => bulk({ codeIds: [code.id] }, sample.reviewer),
    });
    expect(receipt).toEqual({ created: 0 });
    expect(await codes.get(code.id)).toMatchObject({ itemId: keys.firstItem, status: 'approved' });
    expect(await orderLineRepository(main.db).get(sample.lineId)).toMatchObject({ itemId: keys.firstItem });
    expect(await itemRepository(main.db).find(keys.secondItem)).toBeUndefined();
  });
}, 15000);

async function overlap<T>({ main, applicationName }: Fixture, input: {
  readonly paused: ReturnType<typeof gate>; readonly first: () => Promise<unknown>; readonly second: () => Promise<T>;
}): Promise<T | undefined> {
  const holding = input.first();
  let competing: Promise<T> | undefined;
  try {
    await Promise.race([input.paused.entered, holding]);
    const other = settled(input.second());
    competing = other.result;
    await expect.poll(() => blockedOnPostgres(main, applicationName), wait).toBe(true);
  } finally {
    input.paused.release();
    await Promise.allSettled(competing === undefined ? [holding] : [holding, competing]);
  }
  await holding;
  return competing;
}

function reviewWrites(db: AppDatabase, { nextId, afterAudit }: { readonly nextId: EntityId; readonly afterAudit?: () => Promise<void> }) {
  const uow = createUnitOfWork(db, (transaction) => {
    const tx = requireDatabase(transaction);
    const audit = auditRepository(tx);
    return {
      ...placeholderStores(), itemCodes: itemCodeRepository(tx), items: itemRepository(tx), itemNames: itemNameRepository(tx),
      codeLinks: codeLinkRepository(tx), factoryReports: factoryReportRepository(tx), purchaseOrders: purchaseOrderRepository(tx),
      orderLines: orderLineRepository(tx), batches: deliveryBatchRepository(tx),
      audit: { ...audit, async record(entry: Parameters<typeof audit.record>[0]) { await audit.record(entry); await afterAudit?.(); } },
    };
  });
  return { uow, clock, ids: { next: () => nextId } };
}

function reviewCode({ id, codeRaw, itemId, codeType = 'pack_30' }: Pick<ItemCode, 'id' | 'codeRaw' | 'itemId'> & Partial<Pick<ItemCode, 'codeType'>>): ItemCode {
  return { id, createdAt: clock.now(), updatedAt: clock.now(), codeType, codeRaw, codeNorm: codeRaw, itemId, status: itemId === null ? 'pending' : 'approved' };
}

async function seedReviewLine({ fixture, codes }: { readonly fixture: Fixture; readonly codes: readonly [ItemCode, ItemCode] }): Promise<void> {
  const { main, sample } = fixture;
  const items = itemRepository(main.db);
  const codesRepository = itemCodeRepository(main.db);
  for (const code of codes) {
    if (code.itemId === null) throw new Error('合成编码缺少物料');
    await items.save(anItem({ id: code.itemId, displayName: '订单旧名' }));
    await codesRepository.save(code);
  }
  await seedLine({ db: main.db, sample, id: sample.lineId });
  const lines = orderLineRepository(main.db);
  const line = await lines.get(sample.lineId);
  await lines.save({ ...line, nameRaw: '订单旧名', itemId: codes[0].itemId });
}

function reviewKeys(id: string) {
  return {
    left: entityId(`review-left-${id}`), right: entityId(`review-right-${id}`),
    firstItem: entityId(`review-first-${id}`), secondItem: entityId(`review-second-${id}`),
  };
}

async function withReviewFixture(run: (fixture: Fixture, keys: ReturnType<typeof reviewKeys>) => Promise<void>): Promise<void> {
  await withFixture(async (fixture) => {
    const keys = reviewKeys(fixture.sample.id);
    try {
      await run(fixture, keys);
    } finally {
      await fixture.main.exec(`
        delete from item_codes where id in ('${keys.left}', '${keys.right}');
        delete from name_decisions where item_id in ('${keys.firstItem}', '${keys.secondItem}');
        delete from item_names where item_id in ('${keys.firstItem}', '${keys.secondItem}');
        delete from items where id in ('${keys.firstItem}', '${keys.secondItem}');
      `);
    }
  });
}
