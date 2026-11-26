import path from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import type { FileStore } from '../../../application/src/ports/file-store.js';
import type { AppDatabase } from '../client.js';
import { productImages } from '../schema/archive.js';
import { fileStore } from './local-disk.js';

export function productWorkbookImageStore(root: string): FileStore {
  return fileStore(path.resolve(root, 'product-workbook-previews'));
}

export function fileStoreWithProductWorkbookImages(root: string, db: AppDatabase): FileStore {
  const stored = fileStore(root);
  const workbooks = productWorkbookImageStore(root);
  return {
    put: stored.put,
    async read(id) {
      const original = await stored.read(id);
      if (original !== undefined) return original;
      const image = await workbooks.read(id);
      if (image === undefined) return undefined;
      const [visible] = await db.select({ id: productImages.id }).from(productImages)
        .where(and(eq(productImages.fileId, id), isNull(productImages.hiddenAt))).limit(1);
      return visible === undefined ? undefined : image;
    },
  };
}
