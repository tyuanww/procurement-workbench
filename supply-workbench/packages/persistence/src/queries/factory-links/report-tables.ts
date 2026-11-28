import type { FactoryReportKind } from '@sw/domain';
import {
  customerSuppliedReceiptRows, factoryInTransitRows, factoryMaterialDemandRows, factoryPackagingComboRows,
  factoryScheduleCells, factoryShipmentRows, factoryStockRows,
} from '../../schema/factory.js';

export const factoryReportTables = {
  shipment: factoryShipmentRows,
  in_transit: factoryInTransitRows,
  stock: factoryStockRows,
  schedule: factoryScheduleCells,
  packaging_combo: factoryPackagingComboRows,
  customer_supplied: customerSuppliedReceiptRows,
  demand: factoryMaterialDemandRows,
} satisfies Record<FactoryReportKind, unknown>;
