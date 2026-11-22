import { expect, it } from 'vitest';
import { devAuth } from '@sw/auth';
import { createDb, migrate, orderLineRepository, partyRepository, productRepository, purchaseOrderRepository, seed, userDirectory } from '@sw/persistence';
import { aParty, aProduct, aPurchaseOrder, anOrderLine } from '../../../packages/testkit/src/index.js';
import { composeSearch } from '../src/composition/search.js';
import { buildHttpApp } from '../src/http/app.js';
import { registerSearchRoutes } from '../src/http/search/routes.js';
import { loginAs } from './helpers/server.js';
import { barcode, channels, itemCode, supplier } from './helpers/synthetic-imports.js';

it('少于 2 个字时搜索被拒绝', async () => {
  const opened = await open();
  try {
    const cookie = await loginAs(opened.app, 'buyer');
    const response = await opened.app.inject({ method: 'GET', url: '/api/v1/search?q=7', headers: { cookie } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
  } finally {
    await opened.close();
  }
});

it('品号、主体名与渠道条码分别出现在对应搜索分组', async () => {
  const opened = await open();
  try {
    const party = aParty({ displayName: supplier });
    const order = aPurchaseOrder({ supplierPartyId: party.id });
    const line = anOrderLine({ purchaseOrderId: order.id, itemCodeRaw: itemCode });
    await partyRepository(opened.db).save(party);
    await purchaseOrderRepository(opened.db).save(order);
    await orderLineRepository(opened.db).save(line);
    for (const code of channels) {
      await productRepository(opened.db).save(aProduct({ barcodeRaw: code, barcodeBase: barcode }));
    }

    const cookie = await loginAs(opened.app, 'buyer');
    const lines = await search({ app: opened.app, cookie, q: itemCode });
    const parties = await search({ app: opened.app, cookie, q: supplier });
    const products = await search({ app: opened.app, cookie, q: barcode });
    expect(lines.json().lines).toEqual([expect.objectContaining({ kind: 'line', id: line.id })]);
    expect(parties.json().parties).toEqual([expect.objectContaining({ kind: 'party', displayName: supplier })]);
    expect(products.json().products.map((row: { barcodeRaw: string }) => row.barcodeRaw).sort()).toEqual([...channels].sort());
  } finally {
    await opened.close();
  }
});

async function open() {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await seed(handle.exec);
  const app = await buildHttpApp({
    auth: devAuth({ directory: userDirectory(handle.db), accessCode: 'dev-code', secret: '0123456789abcdef0123456789abcdef' }),
    register: (server) => { registerSearchRoutes(server, composeSearch({ db: handle.db })); },
  });
  return { db: handle.db, app, close: async () => { await app.close(); await handle.close(); } };
}

async function search({ app, cookie, q }: { readonly app: Awaited<ReturnType<typeof open>>['app']; readonly cookie: string; readonly q: string }) {
  const response = await app.inject({ method: 'GET', url: `/api/v1/search?q=${encodeURIComponent(q)}`, headers: { cookie } });
  expect(response.statusCode).toBe(200);
  return response;
}
