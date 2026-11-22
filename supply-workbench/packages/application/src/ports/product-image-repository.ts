import type { ProductImage } from '@sw/domain';

export interface ProductImageRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<ProductImage>;
  listByProduct(productId: string): Promise<readonly ProductImage[]>;
  save(image: ProductImage): Promise<void>;
}
