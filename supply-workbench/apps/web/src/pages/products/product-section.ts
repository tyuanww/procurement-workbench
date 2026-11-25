export const productSectionLabels = { archive: '档案', purchases: '采购', stock: '库存', materials: '组成物料' } as const;

export function productSection(params: URLSearchParams) {
  const value = params.get('card');
  return value === 'purchases' || value === 'stock' || value === 'materials' ? value : 'archive';
}
