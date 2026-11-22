import type { AddProductImage, GetProductMaterials, GetProductOverview, GetProductPurchases, GetProductStock, HideProductImage, ListProducts, SetProductContacts, UpdateProduct } from '@sw/application';

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
};
