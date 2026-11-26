import { and, eq } from 'drizzle-orm';
import type { ProductArchiveOwnerRepository } from '@sw/application';
import type { AppDatabase } from '../client.js';
import { bomLines, productArchiveOwners } from '../schema/archive.js';
import { lockBom } from './products.js';

export function productArchiveOwnerRepository(db: AppDatabase): ProductArchiveOwnerRepository {
  return {
    async hasPart({ productBarcodeRaw, partCodeRaw }) {
      await lockBom({ db, productBarcodeRaw });
      const rows = await db.select({ rowNo: bomLines.rowNo }).from(bomLines)
        .where(and(eq(bomLines.productBarcodeRaw, productBarcodeRaw), eq(bomLines.partCodeRaw, partCodeRaw))).limit(1);
      return rows.length !== 0;
    },
    async set({ productId, partCodeRaw: partCode, ownerName }) {
      if (ownerName === null) {
        await db.delete(productArchiveOwners).where(and(eq(productArchiveOwners.productId, productId), eq(productArchiveOwners.partCodeRaw, partCode)));
        return;
      }
      await db.insert(productArchiveOwners).values({ productId, partCodeRaw: partCode, ownerName })
        .onConflictDoUpdate({ target: [productArchiveOwners.productId, productArchiveOwners.partCodeRaw], set: { ownerName } });
    },
  };
}
