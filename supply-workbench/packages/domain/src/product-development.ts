export const PRODUCT_DEVELOPMENT_STORES = ['dafuyan', 'yiling'] as const;
export type ProductDevelopmentStore = (typeof PRODUCT_DEVELOPMENT_STORES)[number];

export const DEVELOPMENT_DESTINATIONS = [
  'pilot_material_to_factory',
  'packaging_to_factory',
  'finished_to_warehouse',
  'other',
] as const;
export type DevelopmentDestination = (typeof DEVELOPMENT_DESTINATIONS)[number];

export const DEVELOPMENT_DESTINATION_LABELS: Readonly<Record<DevelopmentDestination, string>> = {
  pilot_material_to_factory: '中试原料到厂',
  packaging_to_factory: '包材到加工厂',
  finished_to_warehouse: '成品入仓',
  other: '其他开发节点',
};

export function isFactoryDevelopmentDestination(destination: DevelopmentDestination): boolean {
  return destination === 'pilot_material_to_factory' || destination === 'packaging_to_factory';
}
