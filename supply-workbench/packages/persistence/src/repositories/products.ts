import { and, eq, inArray, ne, notExists, sql, type SQL } from 'drizzle-orm';
import { NotFoundError, StateConflictError } from '@sw/application/errors';
import type { BomLine, Product, ProductContact, ProductContactRole, ProductImage } from '@sw/domain';
import type { BomLineRepository } from '../../../application/src/ports/bom-line-repository.js';
import type { ProductContactRepository } from '../../../application/src/ports/product-contact-repository.js';
import type { ProductImageRepository } from '../../../application/src/ports/product-image-repository.js';
import type { ProductRepository } from '../../../application/src/ports/product-repository.js';
import type { AppDatabase } from '../client.js';
import { bomLines, productArchiveOwners, productContacts, productImages, products } from '../schema/archive.js';
import { entityId, entityIdOrNull, productId } from '../mappers/id.js';
import { instant, instantOrNull } from '../mappers/time.js';
import { violatesUnique } from './unique-violation.js';

export function productRepository(db: AppDatabase): ProductRepository {
  return {
    async get(id) {
      const [key] = await db.select({ barcode: products.barcodeRaw }).from(products).where(eq(products.id, id)).limit(1);
      if (key === undefined) throw new NotFoundError('产品', id);
      await lockProductBarcodes(db, [key.barcode]);
      const found = await findProduct(db, eq(products.id, id));
      if (found === undefined) throw new NotFoundError('产品', id);
      return found;
    },
    find: (id) => findProduct(db, eq(products.id, id)),
    findByBarcode: (barcode) => findProductByBarcode(db, barcode),
    lockBarcodes: (barcodes) => lockProductBarcodes(db, barcodes),
    async save(entity) {
      try {
        await db.insert(products).values(entity).onConflictDoUpdate({ target: products.id, set: entity });
      } catch (error) {
        if (violatesUnique(error, 'products_barcode_raw')) throw new StateConflictError('barcode_raw');
        throw error;
      }
    },
  };
}

export function bomLineRepository(db: AppDatabase): BomLineRepository {
  return {
    async replace(productBarcodeRaw, lines) {
      await replaceBomLines({ db, productBarcodeRaw, lines: lines.map(bomInsert) });
    },
  };
}

function bomInsert(line: BomLine): typeof bomLines.$inferInsert {
  return { ...line, cumulativeQty: line.cumulativeQty === null ? null : String(line.cumulativeQty) };
}

export async function replaceBomLines({ db, productBarcodeRaw, lines }: { readonly db: AppDatabase; readonly productBarcodeRaw: string; readonly lines: readonly (typeof bomLines.$inferInsert)[] }): Promise<void> {
  await lockBom({ db, productBarcodeRaw });
  await db.delete(bomLines).where(eq(bomLines.productBarcodeRaw, productBarcodeRaw));
  if (lines.length > 0) await db.insert(bomLines).values([...lines]);
  await db.delete(productArchiveOwners).where(and(
    inArray(productArchiveOwners.productId, db.select({ id: products.id }).from(products).where(eq(products.barcodeRaw, productBarcodeRaw))),
    ne(productArchiveOwners.partCodeRaw, ''),
    notExists(db.select({ partCodeRaw: bomLines.partCodeRaw }).from(bomLines).where(and(
      eq(bomLines.productBarcodeRaw, productBarcodeRaw),
      eq(bomLines.partCodeRaw, productArchiveOwners.partCodeRaw),
    ))),
  ));
}

export async function lockBom({ db, productBarcodeRaw }: { readonly db: AppDatabase; readonly productBarcodeRaw: string }): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext('supply-bom'), hashtext(${productBarcodeRaw}))`);
}

export function productImageRepository(db: AppDatabase): ProductImageRepository {
  return {
    async get(id) {
      const found = await findImage(db, id);
      if (found === undefined) throw new NotFoundError('产品图片', id);
      return found;
    },
    async listByProduct(productId) {
      return (await db.select().from(productImages).where(eq(productImages.productId, productId))).map(toImage);
    },
    async save(image) {
      await db.insert(productImages).values(image).onConflictDoUpdate({ target: productImages.id, set: image });
    },
  };
}

export function productContactRepository(db: AppDatabase): ProductContactRepository {
  return {
    async listByProduct(productId) {
      return (await db.select().from(productContacts).where(eq(productContacts.productId, productId))).map(toContact);
    },
    async replaceRole({ productId, role, people }: { readonly productId: string; readonly role: "packaging" | "quality" | "product_info" | "purchasing" | "production_coord" | "warehouse"; readonly people: readonly ProductContact[] }) {
      await db.delete(productContacts).where(and(eq(productContacts.productId, productId), eq(productContacts.role, role)));
      if (people.length === 0) return;
      await db.insert(productContacts).values([...people]);
    },
  };
}

async function findImage(db: AppDatabase, id: string): Promise<ProductImage | undefined> {
  const row = (await db.select().from(productImages).where(eq(productImages.id, id)))[0];
  return row === undefined ? undefined : toImage(row);
}

function toImage(row: typeof productImages.$inferSelect): ProductImage {
  return { ...row, id: entityId(row.id), productId: productId(row.productId), fileId: entityId(row.fileId), importBatchId: entityIdOrNull(row.importBatchId), uploadedBy: entityIdOrNull(row.uploadedBy), hiddenBy: entityIdOrNull(row.hiddenBy), slot: row.slot === 'outer' ? 'outer' : 'inner', source: row.source === 'upload' ? 'upload' : 'import', hiddenAt: instantOrNull(row.hiddenAt) };
}

function toContact(row: typeof productContacts.$inferSelect): ProductContact {
  return { ...row, productId: productId(row.productId), userId: entityIdOrNull(row.userId), updatedBy: entityId(row.updatedBy), role: contactRole(row.role), source: row.source === 'workbench' ? 'workbench' : 'import', updatedAt: instant(row.updatedAt) };
}

function contactRole(value: string): ProductContactRole {
  if (value === 'packaging' || value === 'purchasing' || value === 'production_coord' || value === 'quality' || value === 'warehouse') return value;
  return 'product_info';
}

export function findProductByBarcode(db: AppDatabase, barcode: string): Promise<Product | undefined> {
  return findProduct(db, eq(products.barcodeRaw, barcode));
}

export async function lockProductBarcodes(db: AppDatabase, barcodes: readonly string[]): Promise<void> {
  for (const productBarcodeRaw of [...new Set(barcodes)].sort()) await lockBom({ db, productBarcodeRaw });
}

async function findProduct(db: AppDatabase, match: SQL): Promise<Product | undefined> {
  const [row] = await db.select().from(products).where(match).limit(1);
  if (row === undefined) return undefined;
  const { workbookFieldSources, ...stored } = row;
  return {
    ...stored,
    id: productId(row.id),
    importBatchId: entityIdOrNull(row.importBatchId),
    editedBy: entityIdOrNull(row.editedBy),
    fieldSources: sourcesOf(row.fieldSources),
    ...(Object.keys(workbookFieldSources).length === 0 ? {} : { workbookFieldSources }),
    createdAt: instant(row.createdAt),
    updatedAt: instant(row.updatedAt),
    editedAt: instantOrNull(row.editedAt),
  };
}

function sourcesOf(value: unknown): Product['fieldSources'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const sources: Record<string, 'import' | 'workbench'> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === 'import' || item === 'workbench') sources[key] = item;
  }
  return sources;
}
