import { expect, it } from 'vitest';
import { localDate } from '../../packages/domain/src/index.js';
import { createDb, followUpQueries, migrate, productQueries, schema } from '../../packages/persistence/src/index.js';

const at = '2026-10-13T00:00:00.000Z';
const stamp = { createdAt: at, updatedAt: at };

it('矛盾旧行的列表筛选和产品档案都跟 latestImportPresence，不跟布尔列', async () => {
  const handle = await createDb({ driver: 'pglite' });
  try {
    await migrate(handle.exec);
    await handle.db.insert(schema.purchaseOrders).values({
      ...stamp,
      id: 'po-1',
      poRaw: 'PO-1',
      poNorm: 'PO-1',
      poFormat: 'OTHER',
      relatedPoRaws: [],
      supplierPartyId: null,
      supplierRaw: null,
      lane: 'finished',
      oaDemandRef: null,
    });
    await handle.db.insert(schema.products).values({
      ...stamp,
      id: 'product-1',
      barcodeRaw: '6900000000001',
      barcodeBase: '6900000000001',
      skuName: '海葡萄',
      fieldSources: {},
    });
    await handle.db.insert(schema.orderLines).values([
      storedLine({ id: 'stale-manual', origin: 'manual', isMissingInLatestImport: true, latestImportPresence: 'not_applicable' }),
      storedLine({ id: 'stale-present', origin: 'import_po_master', isMissingInLatestImport: true, latestImportPresence: 'present' }),
      storedLine({ id: 'real-missing', origin: 'import_po_master', isMissingInLatestImport: false, latestImportPresence: 'missing' }),
    ]);
    const clock = { today: () => localDate('2026-10-13'), now: () => at };
    const queries = followUpQueries({ db: handle.db, clock, timeZone: 'Asia/Shanghai' });
    const missing = await queries.list({ missingInLatestImport: true });
    const present = await queries.list({ missingInLatestImport: false });
    const archive = await productQueries(handle.db, clock).load({ productId: 'product-1' });
    const byId = (left: { readonly id: string }, right: { readonly id: string }) => left.id.localeCompare(right.id);
    const flags = (rows: readonly { readonly id: string; readonly missingInLatestImport: boolean; readonly latestImportPresence?: string }[]) => rows.map((row) => ({ id: row.id, isMissing: row.missingInLatestImport, presence: row.latestImportPresence })).sort(byId);
    expect({
      missing: flags(missing.items),
      present: flags(present.items),
      archived: archive.purchaseRows.map((row) => ({ id: row.orderLine.id, isMissing: row.orderLine.missingInLatestImport })).sort(byId),
    }).toEqual({
      missing: [{ id: 'real-missing', isMissing: true, presence: 'missing' }],
      present: [
        { id: 'stale-manual', isMissing: false, presence: 'not_applicable' },
        { id: 'stale-present', isMissing: false, presence: 'present' },
      ],
      archived: [
        { id: 'real-missing', isMissing: true },
        { id: 'stale-manual', isMissing: false },
        { id: 'stale-present', isMissing: false },
      ],
    });
  } finally {
    await handle.close();
  }
});

function storedLine(input: {
  readonly id: string;
  readonly origin: string;
  readonly isMissingInLatestImport: boolean;
  readonly latestImportPresence: string;
}) {
  return {
    ...stamp,
    id: input.id,
    purchaseOrderId: 'po-1',
    lane: 'finished',
    itemId: null,
    itemCodeRaw: null,
    barcodeRaw: '6900000000001',
    nameRaw: '海葡萄',
    qtyOrdered: '10',
    unit: null,
    buyerUserId: null,
    receiverPartyId: null,
    origin: input.origin,
    currentSnapshotId: null,
    candidateKey: null,
    missingInLatestImport: input.isMissingInLatestImport,
    latestImportPresence: input.latestImportPresence,
    cancelledAt: null,
    cancelReason: null,
    stage: 'no_batch',
    stageChangedAt: at,
    nextDueBatchId: null,
    nextDueDate: null,
  };
}
