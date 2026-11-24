import { eq, inArray } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import { LINE_ORIGINS, LINE_STAGES, PO_FORMATS, projectLatestImportPresence, type LocalDate } from '@sw/domain';
import type { ProductQueries } from '../../../../application/src/ports/product-queries.js';
import type { AppDatabase } from '../../client.js';
import { entityId, entityIdOrNull, productId } from '../../mappers/id.js';
import { instant } from '../../mappers/time.js';
import { numberOrNull } from '../../mappers/number.js';
import { bomLines, productContacts, productImages, products } from '../../schema/archive.js';
import { factoryInTransitRows, factoryStockRows } from '../../schema/factory.js';
import { codeLinks, itemCodes } from '../../schema/platform.js';
import { orderLineSnapshots, orderLines, purchaseOrders } from '../../schema/orders.js';
import { oneOf } from '../follow-up/guards.js';
import { activeFactoryBatchIds } from '../factory-links/snapshot-scope.js';
import { stockOf, transitOf } from '../follow-up/payloads.js';
import { coverFile } from './cover.js';

type Clock = { today(): LocalDate; now(): string };

export function productQueries(db: AppDatabase, clock: Clock): ProductQueries {
  return {
    list: async () => { throw new Error('产品列表由用例从 listSources 计算'); },
    listSources: (query) => listSources({ db, clock, query }),
    getOverview: async () => { throw new Error('产品概览由用例从 load 计算'); },
    load: (input) => loadFacts({ db, clock, productId: input.productId }),
    getPurchases: async () => { throw new Error('采购明细由用例从 load 计算'); },
    getStock: async () => { throw new Error('库存卡由用例从 load 计算'); },
    getMaterials: async () => { throw new Error('组成物料由用例从 load 计算'); },
  };
}

async function listSources({ db, clock, query }: { readonly db: AppDatabase; readonly clock: Clock; readonly query: { readonly q?: string; readonly productLine?: string; readonly page?: number; readonly pageSize?: number } }) {
  const rows = (await db.select().from(products)).filter((row) => (query.q === undefined || row.skuName.includes(query.q) || row.barcodeRaw.includes(query.q)) && (query.productLine === undefined || row.productLine === query.productLine));
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  const slice = rows.slice((page - 1) * pageSize, page * pageSize);
  const images = await pageImages(db, slice.map((row) => row.id));
  return { asOf: clock.now(), sources: slice.map((row) => sourceOf(row, coverFile(images.filter((image) => image.productId === row.id)))), page: { page, pageSize, total: rows.length } };
}

async function pageImages(db: AppDatabase, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db.select().from(productImages).where(inArray(productImages.productId, ids));
}

function sourceOf(row: typeof products.$inferSelect, thumbnail: { readonly fileId: string } | null) {
  return {
    id: row.id,
    skuName: row.skuName,
    barcodeRaw: row.barcodeRaw,
    barcodeBase: row.barcodeBase,
    filingName: row.filingName,
    netContent: row.netContent,
    casePack: row.casePack,
    thumbnail,
    contactsAssigned: 0,
    lines: [],
    stockRows: [],
    approvedLinks: [],
    parts: [],
  };
}

async function loadFacts({ db, clock, productId }: { readonly db: AppDatabase; readonly clock: Clock; readonly productId: string }) {
  const product = (await db.select().from(products).where(eq(products.id, productId)))[0];
  if (product === undefined) throw new NotFoundError('产品', productId);
  const [images, contacts, lines, snapshots, orders, transit, allStock, activeBatchIds, links, codes, parts] = await Promise.all([
    db.select().from(productImages).where(eq(productImages.productId, productId)),
    db.select().from(productContacts).where(eq(productContacts.productId, productId)),
    db.select().from(orderLines),
    db.select().from(orderLineSnapshots),
    db.select().from(purchaseOrders),
    db.select().from(factoryInTransitRows),
    db.select().from(factoryStockRows),
    activeFactoryBatchIds(db),
    db.select().from(codeLinks),
    db.select().from(itemCodes),
    db.select().from(bomLines).where(eq(bomLines.productBarcodeRaw, product.barcodeRaw)),
  ]);
  // 只保留活动快照的库存行：否则同一编码会同时来自新旧快照，D06 的 sameBatchTotal 会判跨批次并返回 null。
  const stock = allStock.filter((row) => activeBatchIds.has(row.importBatchId));
  const approved = approvedLinks(links, codes);
  const purchase = purchaseFacts({ lines, snapshots, orders });
  return {
    asOf: clock.now(),
    product: toProduct(product),
    images: images.map(toImage),
    contacts: contacts.map(toContact),
    purchaseLines: purchase.map((row) => ({ barcodeRaw: row.barcodeRaw, reportedStatus: row.reportedStatus, stage: row.stage })),
    stockRows: stock.flatMap((row) => row.itemCodeNorm === null ? [] : [{ codeNorm: row.itemCodeNorm, qty: numberOrNull(row.qtyOnHand), importBatchId: row.importBatchId }]),
    approvedLinks: approved,
    parts: parts.map((row) => ({ partCodeRaw: row.partCodeRaw, linked: false })),
    bomUses: parts.map((row) => ({ productBarcodeRaw: row.productBarcodeRaw, partCodeRaw: row.partCodeRaw })),
    handlingHints: [],
    bomHeader: headerOf(parts),
    purchaseRows: purchase,
    inTransitRows: transit.flatMap((row) => row.barcodeRaw === null ? [] : [{ barcodeRaw: row.barcodeRaw, row: transitOf(row) }]),
    stockViews: stock.map((row) => stockOf(row)),
    codeLinkViews: [],
    materialParts: parts.map((row) => ({ partCodeRaw: row.partCodeRaw, partName: row.partName, links: { materialLines: 0, demandRows: 0, customerSupplied: 0, inTransit: 0 }, usedByProducts: [], handlingHints: [] })),
  };
}

function purchaseFacts({ lines, snapshots, orders }: { readonly lines: readonly (typeof orderLines.$inferSelect)[]; readonly snapshots: readonly (typeof orderLineSnapshots.$inferSelect)[]; readonly orders: readonly (typeof purchaseOrders.$inferSelect)[] }) {
  const snap = new Map(snapshots.map((row) => [row.id, row]));
  const pos = new Map(orders.map((row) => [row.id, row]));
  return lines.flatMap((line) => {
    if (line.barcodeRaw === null || line.barcodeRaw === '') return [];
    const order = pos.get(line.purchaseOrderId);
    return [{ barcodeRaw: line.barcodeRaw, reportedStatus: statusOf(snap.get(line.currentSnapshotId ?? '')?.data), stage: oneOf(LINE_STAGES, line.stage), orderLine: orderLineOf(line, order) }];
  });
}

function orderLineOf(line: typeof orderLines.$inferSelect, order: typeof purchaseOrders.$inferSelect | undefined) {
  const presence = projectLatestImportPresence({ latestImportPresence: line.latestImportPresence, missingInLatestImport: line.missingInLatestImport, origin: line.origin });
  return {
    id: line.id,
    lane: 'finished' as const,
    po: { id: line.purchaseOrderId, poRaw: order?.poRaw ?? null, poFormat: oneOf(PO_FORMATS, order?.poFormat ?? 'OTHER') },
    nameRaw: line.nameRaw,
    itemCodeRaw: line.itemCodeRaw,
    barcodeRaw: line.barcodeRaw,
    supplier: { id: order?.supplierPartyId ?? null, displayName: null, rawName: order?.supplierRaw ?? null },
    receiver: line.receiverPartyId === null ? null : { id: line.receiverPartyId, displayName: null },
    qtyOrdered: numberOrNull(line.qtyOrdered),
    receivedQty: null,
    factoryDeliveredQty: { value: null, missingReason: 'no_source' as const, provenance: { kind: 'system' as const, rule: 'factoryDeliveredQty', at: instant(line.updatedAt) } },
    stage: oneOf(LINE_STAGES, line.stage),
    nextDue: null,
    daysInStage: 0,
    buyer: null,
    statusReported: null,
    missingInLatestImport: presence.missingInLatestImport,
    openExceptionCount: 0,
    origin: oneOf(LINE_ORIGINS, line.origin),
  };
}

function statusOf(data: unknown): string {
  if (typeof data !== 'object' || data === null || !('statusReported' in data)) return '';
  const cell = data.statusReported;
  if (typeof cell !== 'object' || cell === null || !('value' in cell) || typeof cell.value !== 'string') return '';
  return cell.value;
}

function approvedLinks(links: readonly (typeof codeLinks.$inferSelect)[], codes: readonly (typeof itemCodes.$inferSelect)[]) {
  const norm = new Map(codes.map((row) => [row.id, row.codeNorm]));
  return links.flatMap((link) => {
    if (link.status !== 'approved') return [];
    const left = norm.get(link.fromCodeId);
    const right = norm.get(link.toCodeId);
    if (left === undefined || right === undefined) return [];
    return [{ leftNorm: left, rightNorm: right }];
  });
}

function headerOf(parts: readonly (typeof bomLines.$inferSelect)[]) {
  const first = parts[0];
  if (first === undefined) return null;
  return { reorderCount: first.reorderCount, cumulativeQty: numberOrNull(first.cumulativeQty) };
}

function toProduct(row: typeof products.$inferSelect) {
  return {
    ...row,
    id: productId(row.id),
    importBatchId: entityIdOrNull(row.importBatchId),
    editedBy: entityIdOrNull(row.editedBy),
    fieldSources: sourcesOf(row.fieldSources),
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    editedAt: row.editedAt === null ? null : instant(row.editedAt),
  };
}

function sourcesOf(value: unknown): Record<string, 'import' | 'workbench'> {
  if (typeof value !== 'object' || value === null) return {};
  const sources: Record<string, 'import' | 'workbench'> = {};
  for (const [key, item] of Object.entries(value)) if (item === 'import' || item === 'workbench') sources[key] = item;
  return sources;
}

function toImage(row: typeof productImages.$inferSelect) {
  return {
    ...row,
    id: entityId(row.id),
    productId: productId(row.productId),
    fileId: entityId(row.fileId),
    importBatchId: entityIdOrNull(row.importBatchId),
    uploadedBy: entityIdOrNull(row.uploadedBy),
    hiddenBy: entityIdOrNull(row.hiddenBy),
    slot: row.slot === 'outer' ? 'outer' as const : 'inner' as const,
    source: row.source === 'upload' ? 'upload' as const : 'import' as const,
  };
}

function toContact(row: typeof productContacts.$inferSelect) {
  return {
    ...row,
    productId: productId(row.productId),
    userId: entityIdOrNull(row.userId),
    updatedBy: entityId(row.updatedBy),
    role: contactRole(row.role),
    source: row.source === 'workbench' ? 'workbench' as const : 'import' as const,
    updatedAt: instant(row.updatedAt),
  };
}

function contactRole(value: string): 'product_info' | 'packaging' | 'purchasing' | 'production_coord' | 'quality' | 'warehouse' {
  if (value === 'product_info' || value === 'packaging' || value === 'purchasing' || value === 'production_coord' || value === 'quality' || value === 'warehouse') return value;
  return 'purchasing' as const;
}
