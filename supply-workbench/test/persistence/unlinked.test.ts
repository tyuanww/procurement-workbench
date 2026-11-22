import { expect, it } from 'vitest';
import { entityId, type FactoryReportKind, type FactoryReportRow, type LinkStatus } from '../../packages/domain/src/index.js';
import { createDb, factoryReportRepository, importBatchRepository, masterDataQueries, migrate } from '../../packages/persistence/src/index.js';
import { FixedClock } from '../../packages/testkit/src/index.js';

it('未关联和含糊的上报会回来，已关联和客供不会', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await saveActiveBatch(handle);
  const reports = factoryReportRepository(handle.db);
  await reports.save(row({ id: 'transit-open', kind: 'in_transit', linkStatus: 'unlinked', sheetName: '在途', rowNo: 3 }));
  await reports.save(row({ id: 'ship-amb', kind: 'shipment', linkStatus: 'ambiguous', sheetName: '出货', rowNo: 2 }));
  await reports.save(row({ id: 'stock-linked', kind: 'stock', linkStatus: 'linked', sheetName: '库存', rowNo: 1 }));
  await reports.save(row({ id: 'supplied-open', kind: 'customer_supplied', linkStatus: 'unlinked', sheetName: '客供', rowNo: 4 }));
  await reports.save(row({ id: 'schedule-open', kind: 'schedule', linkStatus: 'unlinked', sheetName: '排期', rowNo: 1, raw: { day: '2026-10-01' } }));
  await reports.save(row({ id: 'schedule-blank', kind: 'schedule', linkStatus: 'unlinked', sheetName: '排期', rowNo: 2, raw: {} }));
  const queries = masterDataQueries(handle.db, new FixedClock('2026-10-12T00:00:00.000Z'));
  const listed = await queries.listUnlinked({});
  expect(listed.items.map((item) => item.id)).toEqual(['ship-amb', 'transit-open', 'schedule-open']);
  expect(listed.items.map((item) => item.id)).not.toContain('stock-linked');
  expect(listed.items.map((item) => item.id)).not.toContain('supplied-open');
  expect(listed.items.map((item) => item.id)).not.toContain('schedule-blank');
  expect(await queries.listDemand({})).toEqual({ items: [], page: { page: 1, pageSize: 50, total: 0 } });
  await handle.close();
});

it('未关联超过一页时第二页仍按行号排，并且总数是全部', async () => {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  await saveActiveBatch(handle);
  const reports = factoryReportRepository(handle.db);
  for (let index = 0; index < 51; index += 1) {
    await reports.save(row({ id: `ship-${index}`, kind: 'shipment', linkStatus: 'unlinked', sheetName: '出货', rowNo: index + 1 }));
  }
  const queries = masterDataQueries(handle.db, new FixedClock('2026-10-12T00:00:00.000Z'));
  const first = await queries.listUnlinked({});
  const second = await queries.listUnlinked({ page: 2 });
  expect(first.page).toEqual({ page: 1, pageSize: 50, total: 51 });
  expect(first.items).toHaveLength(50);
  expect(first.items[0]?.id).toBe('ship-0');
  expect(first.items[49]?.id).toBe('ship-49');
  expect(second.items.map((item) => item.id)).toEqual(['ship-50']);
  expect(second.page.total).toBe(51);
  await handle.close();
});

async function saveActiveBatch(handle: Awaited<ReturnType<typeof createDb>>): Promise<void> {
  await importBatchRepository(handle.db).save({
    id: entityId('import-1'),
    createdAt: '2026-10-12T00:00:00.000Z',
    updatedAt: '2026-10-12T00:00:00.000Z',
    fileId: entityId('file-1'),
    template: 'factory-progress-v1',
    factoryPartyId: entityId('factory-1'),
    status: 'committed',
    sourceKey: 'factory-progress-v1:factory-1',
    sourceFingerprint: 'file-1',
    effectiveAt: '2026-10-12T00:00:00.000Z',
    supersededAt: null,
    fileMeta: {},
    stats: {},
    decisions: {},
    createdBy: entityId('user-1'),
    committedBy: entityId('user-1'),
    committedAt: '2026-10-12T00:00:00.000Z',
    rolledBackBy: null,
    rolledBackAt: null,
    error: null,
  });
}

function row(input: { readonly id: string; readonly kind: FactoryReportKind; readonly linkStatus: LinkStatus; readonly sheetName: string; readonly rowNo: number; readonly raw?: unknown }): FactoryReportRow {
  return {
    id: entityId(input.id),
    importBatchId: entityId('import-1'),
    factoryPartyId: entityId('factory-1'),
    sheetName: input.sheetName,
    rowNo: input.rowNo,
    raw: input.raw ?? {},
    fingerprint: input.id,
    linkedOrderLineId: null,
    linkStatus: input.linkStatus,
    linkReason: null,
    kind: input.kind,
    shipment: input.kind === 'shipment' ? { qty: 1, shipOrArriveOn: null } : null,
    demand: null,
    inTransit: input.kind === 'in_transit' ? { poRaw: 'PO1', poNorm: 'PO1', nameRaw: '面膜', itemCodeRaw: null, barcodeRaw: null, qtyRequired: 1 } : null,
  };
}
