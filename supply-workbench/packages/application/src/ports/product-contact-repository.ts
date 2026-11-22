import type { ProductContact, ProductContactRole } from '@sw/domain';

export interface ProductContactRepository {
  listByProduct(productId: string): Promise<readonly ProductContact[]>;
  /** 替换这一职责下的全部联系人。其他人不动。 */
  replaceRole(input: { readonly productId: string; readonly role: ProductContactRole; readonly people: readonly ProductContact[] }): Promise<void>;
}
