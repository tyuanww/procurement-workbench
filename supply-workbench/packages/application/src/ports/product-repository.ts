import type { Product } from '@sw/domain';

export interface ProductRepository {
  /** 找不到就抛 NotFoundError。 */
  get(id: string): Promise<Product>;
  /** 找不到返回 undefined。 */
  find(id: string): Promise<Product | undefined>;
  findByBarcode?(barcode: string): Promise<Product | undefined>;
  lockBarcodes?(barcodes: readonly string[]): Promise<void>;
  /** 插入或按 id 覆盖。事务由 UnitOfWork.run 负责。 */
  save(entity: Product): Promise<void>;
}
