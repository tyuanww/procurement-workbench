import { and, eq, isNull } from 'drizzle-orm';
import { NotFoundError } from '@sw/application/errors';
import { normalizeText, type Lane, type PoFormat, type PurchaseOrder } from '@sw/domain';
import { LANES, PO_FORMATS } from '@sw/domain';
import type { PurchaseOrderRepository } from '../../../application/src/ports/purchase-order-repository.js';
import type { AppDatabase } from '../client.js';
import { purchaseOrders } from '../schema/orders.js';
import { entityId, entityIdOrNull } from '../mappers/id.js';
import { instant } from '../mappers/time.js';

export function purchaseOrderRepository(db: AppDatabase): PurchaseOrderRepository {
  return {
    async get(id) {
      const found = await findOrder(db, id);
      if (found === undefined) throw new NotFoundError('采购单', id);
      return found;
    },
    find: (id) => findOrder(db, id),
    async save(entity) {
      const row = { ...entity, relatedPoRaws: [...entity.relatedPoRaws] };
      await db.insert(purchaseOrders).values(row).onConflictDoUpdate({ target: purchaseOrders.id, set: row });
    },
    async listByPoNorm(poNorm) {
      return (await db.select().from(purchaseOrders).where(eq(purchaseOrders.poNorm, poNorm))).map(purchaseOrderOfRow);
    },
    async listNoNumber(lane) {
      const rows = await db.select().from(purchaseOrders).where(and(isNull(purchaseOrders.poRaw), eq(purchaseOrders.poFormat, 'NONE'), eq(purchaseOrders.lane, lane)));
      return rows.map(purchaseOrderOfRow);
    },
    async listMissingSupplier(normName) {
      const rows = await db.select().from(purchaseOrders).where(isNull(purchaseOrders.supplierPartyId));
      return rows.map(purchaseOrderOfRow).filter((row) => row.supplierRaw !== null && normalizeText(row.supplierRaw) === normName);
    },
  };
}

async function findOrder(db: AppDatabase, id: string): Promise<PurchaseOrder | undefined> {
  const row = (await db.select().from(purchaseOrders).where(eq(purchaseOrders.id, id)))[0];
  return row === undefined ? undefined : purchaseOrderOfRow(row);
}

export function purchaseOrderOfRow(row: typeof purchaseOrders.$inferSelect): PurchaseOrder {
  return { ...row, id: entityId(row.id), supplierPartyId: entityIdOrNull(row.supplierPartyId), poFormat: poFormat(row.poFormat), lane: laneOf(row.lane), createdAt: instant(row.createdAt), updatedAt: instant(row.updatedAt) };
}

function poFormat(value: string): PoFormat {
  for (const format of PO_FORMATS) if (format === value) return format;
  throw new Error(`认不出的单号格式: ${value}`);
}

function laneOf(value: string): Lane {
  for (const lane of LANES) if (lane === value) return lane;
  throw new Error(`认不出的线: ${value}`);
}
