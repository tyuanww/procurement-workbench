import type { Actor } from '../shared/actor.js';
import type { Clock } from '../ports/clock.js';
import type { FileStore } from '../ports/file-store.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ProductQueries } from '../ports/product-queries.js';
import type { UnitOfWork } from '../ports/unit-of-work.js';
import type {
  AddProductImageInput,
  HideProductImageInput,
  ProductIdInput,
  ProductList,
  ProductListQuery,
  ProductMaterials,
  ProductOverview,
  ProductPurchases,
  ProductPurchasesQuery,
  ProductStock,
  SetProductContactsInput,
  UpdateProductInput,
} from './views.js';

export type * from './views.js';

type Maintain = { readonly uow: UnitOfWork; readonly clock: Clock; readonly ids: IdGenerator };
type Read = { readonly products: ProductQueries };

export type ListProductsDeps = Read;
export type ListProducts = (input: ProductListQuery, actor: Actor) => Promise<ProductList>;
export type GetProductOverviewDeps = Read;
export type GetProductOverview = (input: ProductIdInput, actor: Actor) => Promise<ProductOverview>;
export type GetProductPurchasesDeps = Read;
export type GetProductPurchases = (input: ProductPurchasesQuery, actor: Actor) => Promise<ProductPurchases>;
export type GetProductStockDeps = Read;
export type GetProductStock = (input: ProductIdInput, actor: Actor) => Promise<ProductStock>;
export type GetProductMaterialsDeps = Read;
export type GetProductMaterials = (input: ProductIdInput, actor: Actor) => Promise<ProductMaterials>;
export type UpdateProductDeps = Maintain;
export type UpdateProduct = (input: UpdateProductInput, actor: Actor) => Promise<{ readonly productId: string }>;
export type AddProductImageDeps = Maintain & { readonly files: FileStore };
export type AddProductImage = (input: AddProductImageInput, actor: Actor) => Promise<{ readonly imageId: string }>;
export type HideProductImageDeps = Maintain;
export type HideProductImage = (input: HideProductImageInput, actor: Actor) => Promise<{ readonly imageId: string }>;
export type SetProductContactsDeps = Maintain;
export type SetProductContacts = (input: SetProductContactsInput, actor: Actor) => Promise<{ readonly productId: string }>;
