import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { ProductWorkbookRepository, WorkbookTarget } from '@sw/application';
import type { AppDatabase } from '../client.js';
import { entityId } from '../mappers/id.js';
import { numberOrNull } from '../mappers/number.js';
import { bomLines, productArchiveOwners, productWorkbookImports } from '../schema/archive.js';
import { users } from '../schema/platform.js';
import { findProductByBarcode, lockProductBarcodes, productContactRepository, productImageRepository } from './products.js';

export function productWorkbookRepository(db: AppDatabase): ProductWorkbookRepository {
  return {
    async lockUpload({ anchorId, actorId, fileHash }) {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext('product-workbook-upload'), hashtext(${JSON.stringify([anchorId, actorId, fileHash])}))`);
    },
    lockProducts: (barcodes) => lockProductBarcodes(db, barcodes),
    async find({ id, anchorId, actorId, lock }) {
      const query = db.select({ session: productWorkbookImports.session }).from(productWorkbookImports)
        .where(and(eq(productWorkbookImports.id, id), byAnchor(anchorId), eq(productWorkbookImports.createdBy, actorId)));
      const [row] = await (lock ? query.for('update') : query);
      return row?.session;
    },
    async lastUpload({ anchorId, actorId, fileHash }) {
      const newest = [desc(productWorkbookImports.createdAt), desc(productWorkbookImports.id)];
      const order = anchorId === null
        ? [sql`case when ${productWorkbookImports.session} -> 'preview' ->> 'status' = 'committed' then 0 else 1 end`, ...newest]
        : newest;
      const [row] = await db.select({ session: productWorkbookImports.session }).from(productWorkbookImports)
        .where(and(byAnchor(anchorId), eq(productWorkbookImports.createdBy, actorId), eq(productWorkbookImports.fileHash, fileHash)))
        .orderBy(...order).limit(1);
      return row?.session;
    },
    async save(session) {
      const { anchorId, createdBy, fileHash, preview } = session;
      await db.insert(productWorkbookImports).values({ id: preview.id, anchorId, createdBy, fileHash, session })
        .onConflictDoUpdate({ target: productWorkbookImports.id, set: { session } });
    },
    target: (barcode) => readTarget(db, barcode),
  };
}

function byAnchor(anchorId: string | null) {
  return anchorId === null ? isNull(productWorkbookImports.anchorId) : eq(productWorkbookImports.anchorId, anchorId);
}

async function readTarget(db: AppDatabase, barcode: string): Promise<WorkbookTarget> {
  const product = await findProductByBarcode(db, barcode);
  const parts = await db.select().from(bomLines).where(eq(bomLines.productBarcodeRaw, barcode)).orderBy(bomLines.rowNo, bomLines.partCodeRaw);
  const bom = parts.map((part) => ({ ...part, importBatchId: entityId(part.importBatchId), cumulativeQty: numberOrNull(part.cumulativeQty) }));
  if (product === undefined) return { product, images: [], contacts: [], contactNames: {}, parts: bom, owners: new Map() };
  const id = product.id;
  const [images, contacts, ownerRows] = await Promise.all([
    productImageRepository(db).listByProduct(id),
    productContactRepository(db).listByProduct(id),
    db.select().from(productArchiveOwners).where(eq(productArchiveOwners.productId, id)),
  ]);
  const userIds = contacts.flatMap(({ userId }) => userId === null ? [] : [userId]);
  const directory = userIds.length === 0 ? [] : await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds));
  return {
    product, images, contacts,
    contactNames: Object.fromEntries(directory.map(({ id, name }) => [id, name])),
    parts: bom,
    owners: new Map(ownerRows.map(({ partCodeRaw, ownerName }) => [partCodeRaw, ownerName])),
  };
}
