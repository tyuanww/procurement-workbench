import { hash } from 'node:crypto';
import { generateProductWorkbookTemplate, parseProductWorkbook, productWorkbookImageMime, workbookReader } from '@sw/importers';
import {
  makeAddProductImage,
  makeGetProductMaterials,
  makeGetProductOverview,
  makeGetProductPurchases,
  makeGetProductStock,
  makeHideProductImage,
  makeListProducts,
  makeProductWorkbookImports,
  makeUnhideProductImage,
  makeSetProductContacts,
  makeSetProductOwner,
  makeUpdateProduct,
} from '@sw/application';
import type { LocalDate } from '@sw/domain';
import { ATTACHMENT_MAX_BYTES, IMPORT_FILE_MAX_BYTES } from '@sw/domain';
import {
  auditRepository,
  bomLineRepository,
  productWorkbookRepository,
  createUnitOfWork,
  fileStore,
  productWorkbookImageStore,
  placeholderStores,
  productContactRepository,
  productArchiveOwnerRepository,
  productImageRepository,
  productQueries,
  productRepository,
  requireDatabase,
  userRepository,
  type AppDatabase,
} from '@sw/persistence';
import type { ProductApi } from '../http/product-archive/api.js';
import { systemClock } from '../system/clock.js';
import { systemIds } from '../system/ids.js';

type Clock = { now(): string; today(): LocalDate };

export function register(): never {
  throw new Error('产品档案路由由 buildHttpApp 挂载');
}

export function productAttachmentMaxBytes(): number {
  return ATTACHMENT_MAX_BYTES;
}

export function composeProductArchive(input: { readonly db: AppDatabase; readonly uploadDir: string; readonly timeZone: string; readonly clock?: Clock }): ProductApi {
  const clock = input.clock ?? systemClock(input.timeZone);
  const ids = systemIds();
  const files = fileStore(input.uploadDir);
  const uow = createUnitOfWork(input.db, (tx) => stores(tx));
  const write = { uow, clock, ids, files };
  const products = productQueries(input.db, clock);
  const reads = { products };
  return {
    list: makeListProducts(reads),
    overview: makeGetProductOverview(reads),
    purchases: makeGetProductPurchases(reads),
    stock: makeGetProductStock(reads),
    materials: makeGetProductMaterials(reads),
    update: makeUpdateProduct(write),
    addImage: makeAddProductImage(write),
    hideImage: makeHideProductImage(write),
    unhideImage: makeUnhideProductImage(write),
    contacts: makeSetProductContacts(write),
    setOwner: makeSetProductOwner(write),
    workbookMaxBytes: IMPORT_FILE_MAX_BYTES,
    workbooks: makeProductWorkbookImports({
      ...write,
      previewFiles: productWorkbookImageStore(input.uploadDir),
      workbooks: workbookReader(),
      parse: parseProductWorkbook,
      generateTemplate: generateProductWorkbookTemplate,
      imageMime: productWorkbookImageMime,
      hash: (bytes) => hash('sha256', bytes, 'hex'),
    }),
  };
}

function stores(tx: unknown) {
  const db = requireDatabase(tx);
  return {
    ...placeholderStores(),
    users: userRepository(db),
    products: productRepository(db),
    productImages: productImageRepository(db),
    productContacts: productContactRepository(db),
    productOwners: productArchiveOwnerRepository(db),
    productWorkbooks: productWorkbookRepository(db),
    bomLines: bomLineRepository(db),
    audit: auditRepository(db),
  };
}
