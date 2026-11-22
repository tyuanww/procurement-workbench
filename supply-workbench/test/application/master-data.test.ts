import { expect, it } from 'vitest';
import {dueBatches, localDate, normalizeText, type CodeLink, type ItemCode, type KpiInput, type PartyAlias, entityId, orderLineId} from '../../packages/domain/src/index.js';
import { makeApproveAlias, makeApproveCodeLink, makeGetPartyDetail } from '../../packages/application/src/master-data/index.js';
import type { MasterDataQueries } from '../../packages/application/src/ports/master-data-queries.js';
import type { KpiFigures, PartyDetail } from '../../packages/application/src/master-data/views.js';
import { ForbiddenError } from '../../packages/application/src/shared/errors.js';
import { aFactoryStockRow, aParty, aPurchaseOrder, anActor, anOrderLine, createMemory, FixedClock, SequentialIds } from '../../packages/testkit/src/index.js';

const at = '2026-10-12T00:00:00.000Z';

function alias(patch: Partial<PartyAlias> = {}): PartyAlias {
  return {
    id: entityId('alias-1'),
    createdAt: at,
    updatedAt: at,
    rawName: '怡龙',
    normName: normalizeText('怡龙'),
    partyId: null,
    status: 'pending',
    firstSeenImportBatchId: null,
    seenCount: 1,
    reviewedBy: null,
    reviewedAt: null,
    ...patch,
  };
}

function code(patch: Partial<ItemCode> & Pick<ItemCode, 'id' | 'codeRaw' | 'codeType'>): ItemCode {
  return {
    createdAt: at,
    updatedAt: at,
    codeNorm: normalizeText(patch.codeRaw),
    itemId: null,
    status: 'pending',
    ...patch,
  };
}

function link(patch: Partial<CodeLink> = {}): CodeLink {
  return {
    id: entityId('link-1'),
    createdAt: at,
    updatedAt: at,
    fromCodeId: entityId('barcode'),
    toCodeId: entityId('item-code'),
    status: 'pending',
    evidence: null,
    reviewedBy: null,
    reviewedAt: null,
    ...patch,
  };
}

function deps() {
  const memory = createMemory();
  return { memory, clock: new FixedClock(at), ids: new SequentialIds(), uow: memory.unitOfWork };
}

it('怡龙并到宜侬，不确认就拒绝，确认后回填供应商', async () => {
  const { memory, clock, ids, uow } = deps();
  const party = aParty({ id: entityId('party-yn'), displayName: '宜侬' });
  const order = aPurchaseOrder({ id: entityId('po-1'), supplierRaw: '怡龙', supplierPartyId: null });
  await memory.stores.parties.save(party);
  await memory.stores.aliases.save(alias());
  await memory.stores.purchaseOrders.save(order);
  const approve = makeApproveAlias({ uow, clock, ids });
  await expect(approve({ aliasId: 'alias-1', partyId: party.id }, anActor('reviewer'))).rejects.toMatchObject({ code: 'FORBIDDEN_PAIR_CONFIRM_REQUIRED' });
  expect((await memory.stores.purchaseOrders.get(order.id)).supplierPartyId).toBeNull();
  await approve({ aliasId: 'alias-1', partyId: party.id, confirmForbiddenPair: true }, anActor('reviewer'));
  expect((await memory.stores.aliases.get('alias-1')).partyId).toBe(party.id);
  expect((await memory.stores.purchaseOrders.get(order.id)).supplierPartyId).toBe(party.id);
});

it('采购员不能审核', async () => {
  const { clock, ids, uow } = deps();
  const approve = makeApproveAlias({ uow, clock, ids });
  await expect(approve({ aliasId: 'alias-1', partyId: entityId('party-yn') }, anActor('buyer'))).rejects.toBeInstanceOf(ForbiddenError);
});

it('批准 69 码和品号的对照后，未关联上报行变成 linked', async () => {
  const { memory, clock, ids, uow } = deps();
  const order = aPurchaseOrder({ id: entityId('po-1'), poNorm: 'PO202610120001', poRaw: 'PO202610120001' });
  const line = anOrderLine({ id: orderLineId('line-1'), purchaseOrderId: order.id, itemCodeRaw: '70007019', barcodeRaw: null });
  const row = aFactoryStockRow({
    id: entityId('row-1'),
    kind: 'in_transit',
    linkStatus: 'unlinked',
    inTransit: { poRaw: order.poRaw, poNorm: order.poNorm, nameRaw: '面膜', itemCodeRaw: null, barcodeRaw: '2000000003047', qtyRequired: null },
  });
  await memory.stores.purchaseOrders.save(order);
  await memory.stores.orderLines.save(line);
  await memory.stores.itemCodes.save(code({ id: entityId('barcode'), codeRaw: '2000000003047', codeType: 'barcode_69' }));
  await memory.stores.itemCodes.save(code({ id: entityId('item-code'), codeRaw: '70007019', codeType: 'erp_70' }));
  await memory.stores.codeLinks.save(link());
  await memory.stores.factoryReports.save(row);
  await makeApproveCodeLink({ uow, clock, ids })({ linkId: 'link-1' }, anActor('reviewer'));
  expect(await memory.stores.factoryReports.get(row.id)).toMatchObject({ linkStatus: 'linked', linkedOrderLineId: line.id });
});

it('批准对照后，带采购单号的需求行也会变成 linked', async () => {
  const { memory, clock, ids, uow } = deps();
  const order = aPurchaseOrder({ id: entityId('po-1'), poNorm: 'PO202610120001', poRaw: 'PO202610120001' });
  const line = anOrderLine({ id: orderLineId('line-1'), purchaseOrderId: order.id, itemCodeRaw: '70007019', barcodeRaw: null });
  const row = aFactoryStockRow({
    id: entityId('demand-1'),
    kind: 'demand',
    linkStatus: 'unlinked',
    inTransit: null,
    demand: { role: 'material', blockMaterialPoRaw: order.poRaw, poNorm: order.poNorm, itemCodeRaw: '2000000003047', nameRaw: '面膜', slots: [] },
  });
  await memory.stores.purchaseOrders.save(order);
  await memory.stores.orderLines.save(line);
  await memory.stores.itemCodes.save(code({ id: entityId('barcode'), codeRaw: '2000000003047', codeType: 'barcode_69' }));
  await memory.stores.itemCodes.save(code({ id: entityId('item-code'), codeRaw: '70007019', codeType: 'erp_70' }));
  await memory.stores.codeLinks.save(link());
  await memory.stores.factoryReports.save(row);
  await makeApproveCodeLink({ uow, clock, ids })({ linkId: 'link-1' }, anActor('reviewer'));
  expect(await memory.stores.factoryReports.get(row.id)).toMatchObject({ linkStatus: 'linked', linkedOrderLineId: line.id });
});

it('主体详情的指标来自 D04，不沿用读模型里算好的数字', async () => {
  const kpi: KpiInput = { today: localDate('2026-10-12'), from: localDate('2026-10-01'), to: localDate('2026-10-31'), batches: [], lines: [], dateChanges: [], exceptions: [] };
  const detail = await makeGetPartyDetail({ master: partyQuery(kpi) })({ partyId: 'party-yn' }, anActor('buyer'));
  expect(detail.kpis.dueBatches.numerator).toBe(dueBatches(kpi).numerator);
  expect(detail.kpis.dueBatches.numerator).not.toBe(99);
  expect(detail.kpiWindow).toEqual({ from: kpi.from, to: kpi.to });
});

function page<T>(): { readonly items: readonly T[]; readonly page: { readonly page: number; readonly pageSize: number; readonly total: number } } {
  return { items: [], page: { page: 1, pageSize: 1, total: 0 } };
}

function partyQuery(kpi: KpiInput): MasterDataQueries {
  const empty = { numerator: 99, denominator: 99, n: 99 };
  const kpis: KpiFigures = { dueBatches: empty, onTime: empty, averageDelayDays: empty, overdueNow: empty, dateChanges: empty, noteReturnDays: empty, openExceptions: empty };
  const detail: PartyDetail = { party: { id: 'party-yn', displayName: '宜侬', isSupplier: true, isFactory: false, isOwnWarehouse: false, note: null }, aliases: [], kpis, kpiWindow: { from: localDate('2020-01-01'), to: localDate('2020-01-02') } };
  return {
    reviewCounts: async () => ({ aliases: 0, codes: 0, links: 0, multiName: 0 }),
    listAliases: async () => page(),
    listCodes: async () => page(),
    listCodeLinks: async () => page(),
    listMultiName: async () => page(),
    listParties: async () => page(),
    getParty: async () => detail,
    loadPartyKpi: async () => kpi,
    listItems: async () => page(),
    getItem: async () => { throw new Error('unused'); },
    listUnlinked: async () => page(),
    listDemand: async () => page(),
    listCustomerSupplied: async () => page(),
  };
}
