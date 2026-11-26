import type { makeProductWorkbookImports, AddProductImage, GetProductMaterials, GetProductOverview, GetProductPurchases, GetProductStock, HideProductImage, ListProducts, SetProductContacts, SetProductOwner, UpdateProduct } from '@sw/application';

export type ProductApi = {
  list: ListProducts;
  overview: GetProductOverview;
  purchases: GetProductPurchases;
  stock: GetProductStock;
  materials: GetProductMaterials;
  update: UpdateProduct;
  addImage: AddProductImage;
  hideImage: HideProductImage;
  unhideImage: HideProductImage;
  contacts: SetProductContacts;
  setOwner: SetProductOwner;
  workbookMaxBytes: number;
  workbooks: ReturnType<typeof makeProductWorkbookImports>;
};
