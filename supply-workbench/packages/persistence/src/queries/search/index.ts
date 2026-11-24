import { and, eq, ilike, inArray, isNotNull, or, type SQL } from 'drizzle-orm';
import type { SearchQueries } from '../../../../application/src/ports/search-queries.js';
import type { AppDatabase } from '../../client.js';
import { products } from '../../schema/archive.js';
import {
  factoryInTransitRows,
  factoryMaterialDemandRows,
  factoryPackagingComboRows,
  factoryShipmentRows,
} from '../../schema/factory.js';
import { orderLines, purchaseOrders } from '../../schema/orders.js';
import { parties, partyAliases } from '../../schema/platform.js';
import { activeFactoryBatchIds } from '../factory-links/snapshot-scope.js';

const GROUP_LIMIT = 5;

type LineHit = {
  readonly kind: 'line';
  readonly id: string;
  readonly poRaw: string | null;
  readonly nameRaw: string | null;
  readonly barcodeRaw: string | null;
  readonly itemCodeRaw: string | null;
};

type Bridge = { readonly lineIds: readonly string[]; readonly poKeys: readonly string[] };

export function searchQueries(db: AppDatabase): SearchQueries {
  return { search: (query) => searchAll(db, needle(query.q)) };
}

async function searchAll(db: AppDatabase, like: string) {
  const [lines, foundProducts, foundParties] = await Promise.all([
    searchLines(db, like),
    searchProducts(db, like),
    searchParties(db, like),
  ]);
  return { lines, products: foundProducts, parties: foundParties };
}

function needle(q: string): string {
  return `%${escapeLike(q)}%`;
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function searchLines(db: AppDatabase, like: string): Promise<LineHit[]> {
  const direct = await directLines(db, like);
  const bridged = await linesForBridge(db, await factoryBridge(db, like));
  return uniqueById([...direct, ...bridged]).slice(0, GROUP_LIMIT);
}

async function directLines(db: AppDatabase, like: string): Promise<LineHit[]> {
  const rows = await db
    .select(lineColumns())
    .from(orderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId))
    .where(directWhere(like))
    .limit(GROUP_LIMIT);
  return rows.map(lineHit);
}

function lineColumns() {
  return {
    id: orderLines.id,
    poRaw: purchaseOrders.poRaw,
    nameRaw: orderLines.nameRaw,
    barcodeRaw: orderLines.barcodeRaw,
    itemCodeRaw: orderLines.itemCodeRaw,
  };
}

function directWhere(like: string) {
  return or(
    ilike(orderLines.nameRaw, like),
    ilike(orderLines.barcodeRaw, like),
    ilike(orderLines.itemCodeRaw, like),
    ilike(purchaseOrders.poRaw, like),
    ilike(purchaseOrders.poNorm, like),
  );
}

function lineHit(row: Omit<LineHit, 'kind'>): LineHit {
  return { kind: 'line', ...row };
}

async function factoryBridge(db: AppDatabase, like: string): Promise<Bridge> {
  const activeIds = [...await activeFactoryBatchIds(db)];
  const scope = { db, like, activeIds };
  const parts = await Promise.all([demandKeys(scope), transitKeys(scope), shipmentKeys(scope), comboKeys(scope)]);
  return mergeBridges(parts);
}

type BridgeScope = { readonly db: AppDatabase; readonly like: string; readonly activeIds: readonly string[] };

async function demandKeys(input: BridgeScope): Promise<Bridge> {
  const { db, like, activeIds } = input;
  const rows = await db
    .select({
      po: factoryMaterialDemandRows.blockPoRaw,
      materialPo: factoryMaterialDemandRows.blockMaterialPoRaw,
      lineId: factoryMaterialDemandRows.linkedOrderLineId,
    })
    .from(factoryMaterialDemandRows)
    .where(and(
      or(
        ilike(factoryMaterialDemandRows.itemCodeRaw, like),
        ilike(factoryMaterialDemandRows.nameRaw, like),
        ilike(factoryMaterialDemandRows.blockPoRaw, like),
        ilike(factoryMaterialDemandRows.blockMaterialPoRaw, like),
      ),
      inArray(factoryMaterialDemandRows.importBatchId, [...activeIds]),
    ));
  return bridgeOf(rows.flatMap((row) => [row.po, row.materialPo]), rows.map((row) => row.lineId));
}

async function transitKeys(input: BridgeScope): Promise<Bridge> {
  const { db, like, activeIds } = input;
  const rows = await db
    .select({
      po: factoryInTransitRows.poRaw,
      poNorm: factoryInTransitRows.poNorm,
      lineId: factoryInTransitRows.linkedOrderLineId,
    })
    .from(factoryInTransitRows)
    .where(and(
      or(
        ilike(factoryInTransitRows.itemCodeRaw, like),
        ilike(factoryInTransitRows.barcodeRaw, like),
        ilike(factoryInTransitRows.nameRaw, like),
        ilike(factoryInTransitRows.poRaw, like),
        ilike(factoryInTransitRows.poNorm, like),
      ),
      inArray(factoryInTransitRows.importBatchId, [...activeIds]),
    ));
  return bridgeOf(rows.flatMap((row) => [row.po, row.poNorm]), rows.map((row) => row.lineId));
}

async function shipmentKeys(input: BridgeScope): Promise<Bridge> {
  const { db, like, activeIds } = input;
  const rows = await db
    .select({ po: factoryShipmentRows.poRaw, poNorm: factoryShipmentRows.poNorm, lineId: factoryShipmentRows.linkedOrderLineId })
    .from(factoryShipmentRows)
    .where(and(
      or(
        ilike(factoryShipmentRows.itemCodeRaw, like),
        ilike(factoryShipmentRows.nameRaw, like),
        ilike(factoryShipmentRows.poRaw, like),
        ilike(factoryShipmentRows.poNorm, like),
      ),
      inArray(factoryShipmentRows.importBatchId, [...activeIds]),
    ));
  return bridgeOf(rows.flatMap((row) => [row.po, row.poNorm]), rows.map((row) => row.lineId));
}

async function comboKeys(input: BridgeScope): Promise<Bridge> {
  const { db, like, activeIds } = input;
  const rows = await db
    .select({
      po: factoryPackagingComboRows.poRaw,
      materialPo: factoryPackagingComboRows.materialPoRaw,
      lineId: factoryPackagingComboRows.linkedOrderLineId,
    })
    .from(factoryPackagingComboRows)
    .where(and(
      or(
        ilike(factoryPackagingComboRows.itemCodeRaw, like),
        ilike(factoryPackagingComboRows.nameRaw, like),
        ilike(factoryPackagingComboRows.poRaw, like),
        ilike(factoryPackagingComboRows.materialPoRaw, like),
      ),
      inArray(factoryPackagingComboRows.importBatchId, [...activeIds]),
    ));
  return bridgeOf(rows.flatMap((row) => [row.po, row.materialPo]), rows.map((row) => row.lineId));
}

function bridgeOf(pos: readonly (string | null)[], lineIds: readonly (string | null)[]): Bridge {
  return { poKeys: present(pos), lineIds: present(lineIds) };
}

function present(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((item): item is string => item !== null && item !== ''))];
}

function mergeBridges(parts: readonly Bridge[]): Bridge {
  return { poKeys: present(parts.flatMap((part) => [...part.poKeys])), lineIds: present(parts.flatMap((part) => [...part.lineIds])) };
}

async function linesForBridge(db: AppDatabase, bridge: Bridge): Promise<LineHit[]> {
  const where = bridgeWhere(bridge);
  if (where === undefined) return [];
  const rows = await db
    .select(lineColumns())
    .from(orderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId))
    .where(where)
    .limit(GROUP_LIMIT);
  return rows.map(lineHit);
}

function bridgeWhere(bridge: Bridge): SQL | undefined {
  const byLine = bridge.lineIds.length === 0 ? undefined : inArray(orderLines.id, [...bridge.lineIds]);
  const byPo = bridge.poKeys.length === 0 ? undefined : or(inArray(purchaseOrders.poRaw, [...bridge.poKeys]), inArray(purchaseOrders.poNorm, [...bridge.poKeys]));
  const parts = [byLine, byPo].filter((part) => part !== undefined);
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : or(...parts);
}

async function searchProducts(db: AppDatabase, like: string) {
  const rows = await db
    .select({ id: products.id, skuName: products.skuName, barcodeRaw: products.barcodeRaw, filingName: products.filingName })
    .from(products)
    .where(or(
      ilike(products.skuName, like),
      ilike(products.barcodeRaw, like),
      ilike(products.barcodeBase, like),
      ilike(products.filingName, like),
    ))
    .limit(GROUP_LIMIT);
  return rows.map((row) => ({ kind: 'product' as const, ...row }));
}

async function searchParties(db: AppDatabase, like: string) {
  const named = await db
    .select({ id: parties.id, displayName: parties.displayName })
    .from(parties)
    .where(ilike(parties.displayName, like))
    .limit(GROUP_LIMIT);
  const aliased = await db
    .select({ id: parties.id, displayName: parties.displayName })
    .from(partyAliases)
    .innerJoin(parties, eq(parties.id, partyAliases.partyId))
    .where(and(ilike(partyAliases.rawName, like), isNotNull(partyAliases.partyId)))
    .limit(GROUP_LIMIT);
  return uniqueById([...named, ...aliased]).slice(0, GROUP_LIMIT).map((row) => ({ kind: 'party' as const, ...row }));
}

function uniqueById<T extends { readonly id: string }>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}
