import { productId } from '../../packages/domain/src/index.js';
import { expect, it } from 'vitest';
import { makeGetProductOverview, makeGetProductStock, makeListProducts, makeSetProductContacts, makeUpdateProduct } from '../../packages/application/src/product-archive/index.js';
import type { ProductArchiveFacts, ProductListSource, ProductQueries } from '../../packages/application/src/ports/product-queries.js';
import { ForbiddenError } from '../../packages/application/src/shared/errors.js';
import { aProduct, anActor, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';

const at = '2026-10-12T00:00:00.000Z';

function facts(product = aProduct({ id: productId('p1') })): ProductArchiveFacts {
  return {
    asOf: at,
    product,
    images: [],
    contacts: [],
    purchaseLines: [],
    stockRows: [],
    approvedLinks: [],
    parts: [],
    bomUses: [],
    handlingHints: [],
    bomHeader: null,
    purchaseRows: [],
    inTransitRows: [],
    stockViews: [],
    codeLinkViews: [],
    materialParts: [],
  };
}

function queries(loaded: ProductArchiveFacts): ProductQueries {
  return {
    list: async () => { throw new Error('unused'); },
    listSources: async () => { throw new Error('unused'); },
    getOverview: async () => { throw new Error('unused'); },
    load: async () => loaded,
    getPurchases: async () => { throw new Error('unused'); },
    getStock: async () => { throw new Error('unused'); },
    getMaterials: async () => { throw new Error('unused'); },
  };
}

function listQuery(): ProductQueries {
  const source = (barcodeRaw: string, barcodeBase: string): ProductListSource => ({
    id: barcodeRaw,
    skuName: barcodeRaw,
    barcodeRaw,
    barcodeBase,
    filingName: null,
    netContent: null,
    casePack: null,
    thumbnail: null,
    contactsAssigned: 0,
    lines: [],
    stockRows: [],
    approvedLinks: [],
    parts: [],
  });
  return {
    ...queries(facts()),
    listSources: async () => ({
      asOf: at,
      page: { page: 1, pageSize: 20, total: 2 },
      sources: [source('2000000003023', '2000000003023'), source('2000000003023-2', '2000000003023')],
    }),
  };
}

it('采购员不能改产品，改条码归导入所有', async () => {
  const memory = createMemory();
  const product = aProduct({ id: productId('p1') });
  await memory.stores.products.save(product);
  const update = makeUpdateProduct({ uow: memory.unitOfWork, clock: new FixedClock(at), ids: new SequentialIds() });
  await expect(update({ productId: product.id, skuName: '新名' }, anActor('buyer'))).rejects.toBeInstanceOf(ForbiddenError);
  const barcode = { productId: product.id };
  Object.assign(barcode, { barcodeRaw: '1' });
  await expect(update(barcode, anActor('reviewer'))).rejects.toMatchObject({ code: 'FIELD_OWNED_BY_IMPORT' });
});

it('联系人没有用户也没有名字时拒绝', async () => {
  const memory = createMemory();
  await memory.stores.products.save(aProduct({ id: productId('p1') }));
  const setContacts = makeSetProductContacts({ uow: memory.unitOfWork, clock: new FixedClock(at), ids: new SequentialIds() });
  await expect(setContacts({ productId: productId('p1'), role: 'purchasing', people: [{}] }, anActor('reviewer'))).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
});

it('没有 BOM 时组成物料卡是 no_bom，我方仓库库存恒为 no_source', async () => {
  const products = queries(facts());
  const overview = await makeGetProductOverview({ products })({ productId: 'p1' }, anActor('buyer'));
  const stock = await makeGetProductStock({ products })({ productId: 'p1' }, anActor('buyer'));
  expect(overview.cards.materials).toEqual({ kind: 'no_bom' });
  expect(stock.ownWarehouse).toEqual({ value: null, reason: 'no_source' });
});

it('带后缀的条码才是渠道规格', async () => {
  const listed = await makeListProducts({ products: listQuery() })({ }, anActor('buyer'));
  expect(listed.items.map((item) => [item.barcodeRaw, item.isChannelVariant])).toEqual([
    ['2000000003023', false],
    ['2000000003023-2', true],
  ]);
});
