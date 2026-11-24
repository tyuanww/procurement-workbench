import { expect, it } from 'vitest';
import { makeListUnmatchedFactoryRows } from '../../packages/application/src/factory-links/index.js';
import { entityId, orderLineId, productId, resolveFactoryStock, type FactoryReportRow, type LinkStatus } from '../../packages/domain/src/index.js';
import {
  codeLinkRepository,
  createDb,
  factoryLinkQueries,
  factoryReportRepository,
  followUpQueries,
  importBatchRepository,
  itemCodeRepository,
  masterDataQueries,
  migrate,
  orderLineRepository,
  productQueries,
  productRepository,
  purchaseOrderRepository,
  searchQueries,
} from '../../packages/persistence/src/index.js';
import { aProduct, aPurchaseOrder, anOrderLine, FixedClock } from '../../packages/testkit/src/index.js';

const AT = '2026-10-12T00:00:00.000Z';
const OLD = '2026-10-11T00:00:00.000Z';
const OLD_BATCH = 'factory-batch-old';
const ACTIVE_BATCH = 'factory-batch-active';

it('行详情与已交量只读活动快照，历史快照的同身份行不参与', async () => {
  const handle = await open();
  const order = aPurchaseOrder({ id: entityId('po-1') });
  await purchaseOrderRepository(handle.db).save(order);
  const line = anOrderLine({ id: orderLineId('line-1'), purchaseOrderId: order.id });
  await orderLineRepository(handle.db).save(line);
  const reports = factoryReportRepository(handle.db);
  await reports.save(report({ id: 'ship-old', batchId: OLD_BATCH, kind: 'shipment', sheetName: '成品出货明细', rowNo: 2, linkedOrderLineId: 'line-1', qty: 100 }));
  await reports.save(report({ id: 'ship-active', batchId: ACTIVE_BATCH, kind: 'shipment', sheetName: '成品出货明细', rowNo: 2, linkedOrderLineId: 'line-1', qty: 30 }));

  const detail = await followUpQueries({ db: handle.db, clock: new FixedClock(AT), timeZone: 'Asia/Shanghai' }).getDetail(orderLineId('line-1'));

  expect(detail.factoryReports.shipments).toHaveLength(1);
  expect(detail.factoryReports.shipments[0]?.payload.qty.value).toBe(30);
  expect(detail.line.factoryDeliveredQty.value).toBe(30);
  expect(detail.line.factoryDeliveredQty.missingReason).toBeUndefined();
  await handle.close();
});

it('产品代工厂现货只加载活动快照库存，跨快照同编码不再变 null', async () => {
  const handle = await open();
  await productRepository(handle.db).save(aProduct({ id: productId('p-1'), barcodeRaw: 'BAR-1', barcodeBase: 'BAR-1' }));
  await itemCodeRepository(handle.db).save(itemCode({ id: 'code-barcode', codeType: 'barcode_69', codeRaw: 'BAR-1', codeNorm: 'BAR-1' }));
  await itemCodeRepository(handle.db).save(itemCode({ id: 'code-erp', codeType: 'erp_70', codeRaw: 'C1', codeNorm: 'C1' }));
  await codeLinkRepository(handle.db).save({ id: entityId('link-1'), createdAt: AT, updatedAt: AT, fromCodeId: entityId('code-barcode'), toCodeId: entityId('code-erp'), status: 'approved', evidence: null, reviewedBy: null, reviewedAt: null });
  const reports = factoryReportRepository(handle.db);
  await reports.save(report({ id: 'stock-old', batchId: OLD_BATCH, kind: 'stock', sheetName: '库存数量汇总', rowNo: 2, codeNorm: 'C1', qtyOnHand: 5 }));
  await reports.save(report({ id: 'stock-active', batchId: ACTIVE_BATCH, kind: 'stock', sheetName: '库存数量汇总', rowNo: 2, codeNorm: 'C1', qtyOnHand: 3 }));

  const facts = await productQueries(handle.db, new FixedClock(AT)).load({ productId: productId('p-1') });
  const resolved = resolveFactoryStock({ barcodeRaw: 'BAR-1', approvedLinks: facts.approvedLinks, stockRows: facts.stockRows });

  expect(facts.stockRows).toEqual([{ codeNorm: 'C1', qty: 3, importBatchId: ACTIVE_BATCH }]);
  expect(facts.stockViews).toHaveLength(1);
  expect(resolved).toMatchObject({ kind: 'linked', total: 3 });
  await handle.close();
});

it('未关联队列不列历史快照行，只列活动快照行', async () => {
  const handle = await open();
  const reports = factoryReportRepository(handle.db);
  await reports.save(report({ id: 'transit-old', batchId: OLD_BATCH, kind: 'in_transit', sheetName: '在途订单汇总', rowNo: 5, linkStatus: 'unlinked' }));
  await reports.save(report({ id: 'transit-active', batchId: ACTIVE_BATCH, kind: 'in_transit', sheetName: '在途订单汇总', rowNo: 6, linkStatus: 'unlinked' }));

  const listed = await masterDataQueries(handle.db, new FixedClock(AT)).listUnlinked({});

  expect(listed.items.map((item) => item.id)).toEqual(['transit-active']);
  await handle.close();
});

it('工厂诊断先排除可挂接的活动行，再按快照范围分页', async () => {
  const handle = await open();
  try {
    const reports = factoryReportRepository(handle.db);
    await reports.save(report({ id: 'same-id', batchId: ACTIVE_BATCH, kind: 'in_transit', sheetName: '在途订单汇总', rowNo: 3, linkStatus: 'unlinked' }));
    await reports.save(report({ id: 'same-id', batchId: ACTIVE_BATCH, kind: 'schedule', sheetName: '排产计划', rowNo: 4, linkStatus: 'unlinked' }));
    await reports.save(report({ id: 'history-1', batchId: OLD_BATCH, kind: 'in_transit', sheetName: '在途订单汇总', rowNo: 5, linkStatus: 'unlinked' }));
    await reports.save(report({ id: 'history-2', batchId: OLD_BATCH, kind: 'in_transit', sheetName: '在途订单汇总', rowNo: 6, linkStatus: 'unlinked' }));
    const otherKinds = ['customer_supplied', 'demand', 'packaging_combo', 'schedule', 'shipment', 'stock'] as const;
    for (const kind of otherKinds) {
      await reports.save(report({ id: `history-${kind}`, batchId: OLD_BATCH, kind, sheetName: kind, rowNo: 1, linkStatus: 'ambiguous' }));
    }
    await reports.save(report({ id: 'history-linked', batchId: OLD_BATCH, kind: 'stock', sheetName: '库存数量汇总', rowNo: 2, linkStatus: 'unlinked', linkedOrderLineId: 'line-1' }));
    await handle.exec(`INSERT INTO factory_schedule_cells (id, import_batch_id, factory_party_id, sheet_name, row_no, raw, day, fingerprint, link_status, created_at, updated_at)
      SELECT id, 'factory-batch-active', 'factory-1', '排产计划', row_no, raw::jsonb, day::date, id, status, now(), now()
      FROM (VALUES
        ('schedule-raw-only', 1, '{"day":"2024-02-29"}', NULL, 'ambiguous'),
        ('schedule-column-fallback', 2, '{"day":"2023-02-29"}', '2026-12-01', 'unlinked'),
        ('schedule-invalid', 3, '{"day":"2023-02-29"}', NULL, 'unlinked'),
        ('schedule-manual', 5, '{"day":"2024-02-29"}', NULL, 'manual')
      ) AS fixture(id, row_no, raw, day, status)`);
    const queue = await masterDataQueries(handle.db, new FixedClock(AT)).listUnlinked({});
    expect(queue.items).toEqual([
      expect.objectContaining({ id: 'same-id', kind: 'in_transit' }),
      expect.objectContaining({ id: 'schedule-raw-only', kind: 'schedule', payload: expect.objectContaining({ day: '2024-02-29' }) }),
      expect.objectContaining({ id: 'schedule-column-fallback', kind: 'schedule', payload: expect.objectContaining({ day: '2026-12-01' }) }),
    ]);

    const unmatched = makeListUnmatchedFactoryRows({ links: factoryLinkQueries(handle.db) });
    const reviewer = { id: entityId('reviewer-1'), name: '审核人', roles: ['reviewer'] as const };
    expect(await unmatched({ scope: 'active', page: 1, pageSize: 1 }, reviewer)).toEqual({
      items: [expect.objectContaining({ rowId: 'same-id', kind: 'schedule' })],
      page: { page: 1, pageSize: 1, total: 2 },
    });
    expect(await unmatched({ scope: 'active', page: 2, pageSize: 1 }, reviewer)).toEqual({
      items: [expect.objectContaining({ rowId: 'schedule-invalid', kind: 'schedule' })],
      page: { page: 2, pageSize: 1, total: 2 },
    });
    for (const page of [1, 2]) {
      expect(await unmatched({ scope: 'historical', page, pageSize: 1 }, reviewer)).toEqual({
        items: [expect.objectContaining({ rowId: `history-${page}` })],
        page: { page, pageSize: 1, total: 8 },
      });
    }
    expect(await unmatched({ scope: 'historical', page: 2, pageSize: 2 }, reviewer)).toEqual({
      items: otherKinds.slice(0, 2).map((kind) => expect.objectContaining({ rowId: `history-${kind}`, kind })),
      page: { page: 2, pageSize: 2, total: 8 },
    });
    expect(await unmatched({ scope: 'historical', page: 99, pageSize: 20 }, reviewer)).toEqual({
      items: [], page: { page: 99, pageSize: 20, total: 8 },
    });
    expect(await unmatched({ limit: 1 }, reviewer)).toEqual({ items: [expect.objectContaining({ rowId: 'history-1', kind: 'in_transit' })] });
    expect(await unmatched({}, reviewer)).toEqual({
      items: [
        ...['history-1', 'history-2'].map((rowId) => expect.objectContaining({ rowId, kind: 'in_transit' })),
        ...otherKinds.map((kind) => expect.objectContaining({ rowId: `history-${kind}`, kind })),
        ...['in_transit', 'schedule'].map((kind) => expect.objectContaining({ rowId: 'same-id', kind })),
        ...['schedule-column-fallback', 'schedule-invalid', 'schedule-raw-only'].map((rowId) => expect.objectContaining({ rowId, kind: 'schedule' })),
      ],
    });
  } finally {
    await handle.close();
  }
});

it('搜索的工厂桥接不把历史快照的单号带出来', async () => {
  const handle = await open();
  const order = aPurchaseOrder({ id: entityId('po-1') });
  await purchaseOrderRepository(handle.db).save(order);
  await orderLineRepository(handle.db).save(anOrderLine({ id: orderLineId('line-1'), purchaseOrderId: order.id }));
  const reports = factoryReportRepository(handle.db);
  await reports.save(report({ id: 'transit-old', batchId: OLD_BATCH, kind: 'in_transit', sheetName: '在途订单汇总', rowNo: 5, poRaw: 'PO-OLD-ONLY', linkedOrderLineId: 'line-1' }));
  await reports.save(report({ id: 'transit-active', batchId: ACTIVE_BATCH, kind: 'in_transit', sheetName: '在途订单汇总', rowNo: 6, poRaw: 'PO-NEW-ONLY', linkedOrderLineId: 'line-1' }));

  const queries = searchQueries(handle.db);
  const old = await queries.search({ q: 'PO-OLD-ONLY' });
  const active = await queries.search({ q: 'PO-NEW-ONLY' });

  expect(old.lines).toEqual([]);
  expect(active.lines.map((hit) => hit.id)).toEqual(['line-1']);
  await handle.close();
});

async function open(): Promise<Awaited<ReturnType<typeof createDb>>> {
  const handle = await createDb({ driver: 'pglite' });
  await migrate(handle.exec);
  const batches = importBatchRepository(handle.db);
  await batches.save(batch({ id: OLD_BATCH, committedAt: OLD, supersededAt: OLD }));
  await batches.save(batch({ id: ACTIVE_BATCH, committedAt: AT, supersededAt: null }));
  return handle;
}

function batch(input: { readonly id: string; readonly committedAt: string; readonly supersededAt: string | null }) {
  const { id, committedAt, supersededAt } = input;
  return {
    id: entityId(id), createdAt: committedAt, updatedAt: committedAt, fileId: entityId(`file-${id}`),
    template: 'factory-progress-v1' as const, factoryPartyId: entityId('factory-1'), status: 'committed' as const,
    sourceKey: 'factory-progress-v1:factory-1', sourceFingerprint: `file-${id}`, effectiveAt: committedAt, supersededAt,
    fileMeta: {}, stats: {}, decisions: {}, createdBy: entityId('user-1'), committedBy: entityId('user-1'),
    committedAt, rolledBackBy: null, rolledBackAt: null, error: null,
  };
}

function report(input: {
  readonly id: string;
  readonly batchId: string;
  readonly kind: FactoryReportRow['kind'];
  readonly sheetName: string;
  readonly rowNo: number;
  readonly linkStatus?: LinkStatus;
  readonly linkedOrderLineId?: string;
  readonly qty?: number;
  readonly qtyOnHand?: number;
  readonly codeNorm?: string;
  readonly poRaw?: string;
}): FactoryReportRow {
  return {
    id: entityId(input.id),
    importBatchId: entityId(input.batchId),
    factoryPartyId: entityId('factory-1'),
    sheetName: input.sheetName,
    rowNo: input.rowNo,
    raw: input.qtyOnHand === undefined ? {} : { itemCodeRaw: { value: input.codeNorm ?? null }, qtyOnHand: { value: input.qtyOnHand } },
    fingerprint: `${input.sheetName}:${input.rowNo}:${input.id}`,
    linkedOrderLineId: input.linkedOrderLineId === undefined ? null : orderLineId(input.linkedOrderLineId),
    linkStatus: input.linkStatus ?? 'linked',
    linkReason: null,
    kind: input.kind,
    shipment: input.kind === 'shipment' ? { qty: input.qty ?? null, shipOrArriveOn: null } : null,
    demand: null,
    inTransit: input.kind === 'in_transit' ? { poRaw: input.poRaw ?? null, poNorm: input.poRaw ?? null, nameRaw: null, itemCodeRaw: null, barcodeRaw: null, qtyRequired: null } : null,
  };
}

function itemCode(input: { readonly id: string; readonly codeType: 'barcode_69' | 'erp_70'; readonly codeRaw: string; readonly codeNorm: string }) {
  return { id: entityId(input.id), createdAt: AT, updatedAt: AT, codeType: input.codeType, codeRaw: input.codeRaw, codeNorm: input.codeNorm, itemId: null, status: 'approved' as const };
}
