import { and, asc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import { normalizeProcurementReference, procurementOaReferences, type OrderLineId, type ProductDevelopmentStore } from '@sw/domain';
import type { DevelopmentMaterialOption, DevelopmentOrderOption } from '@sw/application';
import type { AppDatabase } from '../../client.js';
import { orderLineId } from '../../mappers/id.js';
import { orderLines, purchaseOrders } from '../../schema/orders.js';
import { procurementFinishedLines } from '../../schema/procurement.js';
import { currentLineOaReference } from '../store-progress/line-oa-reference.js';
import { scopedEdgeExists, storeFilter } from '../store-progress/scope.js';

const ORDER_LIMIT = 30;
const SCAN_PAGE = 100;
const LINE_OA_REFERENCE = currentLineOaReference({ lineId: orderLines.id, snapshotId: orderLines.currentSnapshotId });
const ORDER_COLUMNS = {
  orderLineId: orderLines.id, poRaw: purchaseOrders.poRaw, itemName: orderLines.nameRaw, itemCode: orderLines.itemCodeRaw,
};

function eligibleOrders(db: AppDatabase, input: { readonly store: ProductDevelopmentStore; readonly filter: SQL }) {
  return db.select({ ...ORDER_COLUMNS, oaRaw: LINE_OA_REFERENCE }).from(orderLines)
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId))
    .where(and(eq(orderLines.lane, 'finished'), isNull(orderLines.cancelledAt), isNotNull(orderLines.currentSnapshotId), input.filter,
      storeFilter({ store: input.store, line: orderLines.id, hasMaterialScope: false })));
}

function toOption({ oaRaw, ...row }: { readonly oaRaw: string | null } & Record<keyof typeof ORDER_COLUMNS, string | null>, search?: string): DevelopmentOrderOption | undefined {
  const refs = procurementOaReferences(oaRaw);
  if (refs.length === 0 || row.orderLineId === null) return undefined;
  if (search !== undefined && !refs.some((ref) => normalizeProcurementReference(ref.raw).includes(search))) return undefined;
  return { ...row, orderLineId: orderLineId(row.orderLineId), oaRef: refs.map((ref) => ref.raw).join(' / ') };
}

export async function validDevelopmentOrder(db: AppDatabase, input: { readonly store: ProductDevelopmentStore; readonly orderLineId: OrderLineId }) {
  const [row] = await eligibleOrders(db, { store: input.store, filter: eq(orderLines.id, input.orderLineId) });
  return row === undefined ? undefined : toOption(row);
}

export async function developmentOrderOptions(db: AppDatabase, input: { readonly store: ProductDevelopmentStore; readonly search: string }): Promise<readonly DevelopmentOrderOption[]> {
  const search = normalizeProcurementReference(input.search);
  if (search === '') return [];
  const matches = sql`strpos(upper(regexp_replace(normalize(${LINE_OA_REFERENCE}, NFKC), '[[:space:]]+', '', 'g')), ${search}) > 0`;
  const results: DevelopmentOrderOption[] = [];
  for (let offset = 0; results.length < ORDER_LIMIT; offset += SCAN_PAGE) {
    const rows = await eligibleOrders(db, { store: input.store, filter: matches }).orderBy(asc(orderLines.id)).limit(SCAN_PAGE).offset(offset);
    for (const row of rows) {
      const option = toOption(row, search);
      if (option !== undefined) results.push(option);
    }
    if (rows.length < SCAN_PAGE) break;
  }
  return results.slice(0, ORDER_LIMIT);
}

function eligibleMaterials(input: { readonly store: ProductDevelopmentStore; readonly orderLineId: OrderLineId }) {
  return and(eq(procurementFinishedLines.finishedLineId, input.orderLineId),
    eq(orderLines.lane, 'material'), isNull(orderLines.cancelledAt),
    scopedEdgeExists({ store: input.store, edgeCondition: sql`finished_id = ${input.orderLineId} and material_line_id = ${orderLines.id}` }));
}

function selectMaterials(db: AppDatabase) {
  return db.select(ORDER_COLUMNS).from(procurementFinishedLines)
    .innerJoin(orderLines, eq(orderLines.id, procurementFinishedLines.materialLineId))
    .innerJoin(purchaseOrders, eq(purchaseOrders.id, orderLines.purchaseOrderId));
}

export async function developmentMaterialOptions(db: AppDatabase, input: { readonly store: ProductDevelopmentStore; readonly orderLineId: OrderLineId }): Promise<readonly DevelopmentMaterialOption[]> {
  if (await validDevelopmentOrder(db, input) === undefined) return [];
  const rows = await selectMaterials(db).where(eligibleMaterials(input)).orderBy(asc(orderLines.id));
  return rows.map((row) => ({ ...row, orderLineId: orderLineId(row.orderLineId) }));
}

export async function isDevelopmentMaterial(db: AppDatabase, input: { readonly store: ProductDevelopmentStore; readonly orderLineId: OrderLineId; readonly materialLineId: OrderLineId }): Promise<boolean> {
  const rows = await selectMaterials(db).where(and(eligibleMaterials(input), eq(orderLines.id, input.materialLineId))).limit(1);
  return rows.length > 0;
}
