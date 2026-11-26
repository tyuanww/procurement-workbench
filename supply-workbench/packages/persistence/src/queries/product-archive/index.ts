import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { productContactDisplay } from '@sw/application';
import { NotFoundError } from '@sw/application/errors';
import { LINE_ORIGINS, LINE_STAGES, PO_FORMATS, projectLatestImportPresence, type LocalDate } from '@sw/domain';
import type { ProductArchiveFacts, ProductQueries } from '../../../../application/src/ports/product-queries.js';
import type { AppDatabase } from '../../client.js';
import { entityId, entityIdOrNull, productId } from '../../mappers/id.js';
import { instant } from '../../mappers/time.js';
import { numberOrNull } from '../../mappers/number.js';
import { bomLines, productArchiveOwners, productContacts, productImages, products } from '../../schema/archive.js';
import { factoryInTransitRows, factoryStockRows } from '../../schema/factory.js';
import { codeLinks, itemCodes, users } from '../../schema/platform.js';
import { orderLineSnapshots, orderLines, purchaseOrders } from '../../schema/orders.js';
import { oneOf } from '../follow-up/guards.js';
import { activeFactoryBatchIds } from '../factory-links/snapshot-scope.js';
import { stockOf, transitOf } from '../follow-up/payloads.js';
import { coverFile, packagingFiles } from './cover.js';

type Clock = { today(): LocalDate; now(): string };
type ReadDatabase = Pick<AppDatabase, 'select'>;
const SNAPSHOT = { isolationLevel: 'repeatable read', accessMode: 'read only' } as const;

export function productQueries(db: AppDatabase, clock: Clock): ProductQueries {
  return {
    list: async () => { throw new Error('产品列表由用例从 listSources 计算'); },
    listSources: (query) => listSources({ db, clock, query }),
    getOverview: async () => { throw new Error('产品概览由用例从 load 计算'); },
    load: (input) => db.transaction((tx) => loadFacts({ db: tx, clock, ...input }), SNAPSHOT),
    getPurchases: async () => { throw new Error('采购明细由用例从 load 计算'); },
    getStock: async () => { throw new Error('库存卡由用例从 load 计算'); },
    getMaterials: async () => { throw new Error('组成物料由用例从 load 计算'); },
  };
}

async function listSources({ db, clock, query }: { readonly db: AppDatabase; readonly clock: Clock; readonly query: Parameters<ProductQueries['listSources']>[0] }) {
  const term = query.q;
  const match = term ? sql`(strpos(${products.skuName}, ${term}) > 0 or strpos(${products.barcodeRaw}, ${term}) > 0)` : undefined;
  const line = query.productLine === undefined ? undefined : eq(products.productLine, query.productLine);
  const rank = term ? [desc(eq(products.barcodeRaw, term)), products.id] : [products.id];
  const where = and(match, line);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  const { items, total, images, owners } = await db.transaction(async (tx) => {
    const total = await tx.$count(products, where);
    const items = await tx.select().from(products).where(where).orderBy(...rank).limit(pageSize).offset((page - 1) * pageSize);
    const ids = items.map((row) => row.id);
    const images = await pageImages(tx, ids);
    const owners = query.owners ? await pageOwners(tx, ids) : undefined;
    return { items, total, images, owners };
  }, SNAPSHOT);
  const sources = items.map((row) => {
    const productImages = images.filter((image) => image.productId === row.id);
    const thumbnail = coverFile(productImages, query.cover);
    return {
      ...sourceOf(row, thumbnail),
      ...(query.cover === 'packaging' ? { packagingImages: packagingFiles(productImages) } : {}),
      ...(query.filing === true ? { filingNo: row.filingNo } : {}),
      ...(owners === undefined ? {} : { ownerName: owners.get(row.id) ?? null }),
    };
  });
  return { asOf: clock.now(), sources, page: { page, pageSize, total } };
}

async function pageImages(db: ReadDatabase, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return db.select().from(productImages).where(inArray(productImages.productId, ids));
}

async function pageOwners(db: ReadDatabase, ids: readonly string[]): Promise<ReadonlyMap<string, string | null>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ productId: productContacts.productId, userId: productContacts.userId, nameRaw: productContacts.nameRaw, userName: users.name })
    .from(productContacts)
    .leftJoin(users, eq(productContacts.userId, users.id))
    .where(and(inArray(productContacts.productId, ids), eq(productContacts.role, 'product_info')));
  const names = new Map(rows.flatMap(({ userId, userName }) => userId === null || userName === null ? [] : [[userId, userName]]));
  const byProduct = new Map<string, typeof rows>();
  for (const row of rows) {
    const people = byProduct.get(row.productId) ?? [];
    people.push(row);
    byProduct.set(row.productId, people);
  }
  return new Map([...byProduct.entries()].map(([id, contacts]) => [id, productContactDisplay(contacts, names)]));
}

function sourceOf(row: typeof products.$inferSelect, thumbnail: ReturnType<typeof coverFile>) {
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

async function loadFacts({ db, clock, productId, owners }: Parameters<ProductQueries['load']>[0] & { readonly db: ReadDatabase; readonly clock: Clock }) {
  const product = (await db.select().from(products).where(eq(products.id, productId)))[0];
  if (product === undefined) throw new NotFoundError('产品', productId);
  const images = await db.select().from(productImages).where(eq(productImages.productId, productId));
  const contacts = await db.select().from(productContacts).where(eq(productContacts.productId, productId));
  const lines = await db.select().from(orderLines);
  const snapshots = await db.select().from(orderLineSnapshots);
  const orders = await db.select().from(purchaseOrders);
  const transit = await db.select().from(factoryInTransitRows);
  const allStock = await db.select().from(factoryStockRows);
  const activeBatchIds = await activeFactoryBatchIds(db);
  const links = await db.select().from(codeLinks);
  const codes = await db.select().from(itemCodes);
  const parts = await db.select().from(bomLines).where(eq(bomLines.productBarcodeRaw, product.barcodeRaw)).orderBy(bomLines.rowNo, bomLines.partCodeRaw);
  const ownerRows = owners ? await db.select().from(productArchiveOwners).where(eq(productArchiveOwners.productId, productId)) : undefined;
  // 只保留活动快照的库存行：否则同一编码会同时来自新旧快照，D06 的 sameBatchTotal 会判跨批次并返回 null。
  const stock = allStock.filter((row) => activeBatchIds.has(row.importBatchId));
  const purchase = purchaseFacts({ lines, snapshots, orders });
  const ownerName = owners ? await finishedOwnerName(db, contacts) : undefined;
  return {
    asOf: clock.now(),
    product: toProduct(product),
    images: images.map(toImage),
    contacts: contacts.map(toContact),
    ...(ownerName === undefined ? {} : { ownerName }),
    purchaseLines: purchase.map((row) => ({ barcodeRaw: row.barcodeRaw, reportedStatus: row.reportedStatus, stage: row.stage })),
    stockRows: stock.flatMap((row) => row.itemCodeNorm === null ? [] : [{ codeNorm: row.itemCodeNorm, qty: numberOrNull(row.qtyOnHand), importBatchId: row.importBatchId }]),
    approvedLinks: approvedLinks(links, codes),
    parts: parts.map((row) => ({ partCodeRaw: row.partCodeRaw, linked: false })),
    bomUses: parts.map((row) => ({ productBarcodeRaw: row.productBarcodeRaw, partCodeRaw: row.partCodeRaw })),
    handlingHints: [],
    bomHeader: headerOf(parts),
    purchaseRows: purchase,
    inTransitRows: transit.flatMap((row) => row.barcodeRaw === null ? [] : [{ barcodeRaw: row.barcodeRaw, row: transitOf(row) }]),
    stockViews: stock.map((row) => stockOf(row)),
    codeLinkViews: [],
    materialParts: materialPartsOf(parts, ownerRows === undefined ? undefined : new Map(ownerRows.map((row) => [row.partCodeRaw, row.ownerName]))),
  };
}

async function finishedOwnerName(db: ReadDatabase, rows: readonly (typeof productContacts.$inferSelect)[]): Promise<string | null> {
  const contacts = rows.filter((row) => row.role === 'product_info');
  const userIds = contacts.flatMap(({ userId }) => userId === null ? [] : [userId]);
  const directory = userIds.length === 0 ? [] : await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds));
  return productContactDisplay(contacts, new Map(directory.map(({ id, name }) => [id, name])));
}

function materialPartsOf(parts: readonly (typeof bomLines.$inferSelect)[], ownerByPart: ReadonlyMap<string, string> | undefined): ProductArchiveFacts['materialParts'] {
  return parts.map((row) => ({
    partCodeRaw: row.partCodeRaw,
    partName: row.partName,
    ...(ownerByPart === undefined ? {} : { ownerName: row.partCodeRaw === '' ? null : ownerByPart.get(row.partCodeRaw) ?? null }),
    links: { materialLines: 0, demandRows: 0, customerSupplied: 0, inTransit: 0 },
    usedByProducts: [],
    handlingHints: [],
  }));
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
    ...(Object.keys(row.workbookFieldSources).length === 0 ? {} : { workbookFieldSources: row.workbookFieldSources }),
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
