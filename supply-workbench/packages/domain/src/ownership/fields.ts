import { DomainRuleViolation } from '../errors.js';

export type OwnershipEntity = 'order_line' | 'delivery_batch' | 'factory_report' | 'party' | 'item' | 'product';

// 品名不在 01 第 8 节那句括号里，但 06 D02 和 05 的 PATCH 明确：导入行改品名也要拒绝。
export const ORDER_LINE_IMPORT_FIELDS = [
  'nameRaw',
  'qtyOrdered',
  'itemCodeRaw',
  'barcodeRaw',
  'oaSubmittedOn',
  'oaRequiredOn',
  'plannedDurationDays',
  'actualStartOn',
  'firstDeliveryOn',
  'actualEndOn',
  'actualDurationDays',
  'factoryStockReported',
  'shippedQtyReported',
  'qtyDiffReported',
  'statusReported',
] as const;

export const ORDER_LINE_WORKBENCH_FIELDS = ['buyerUserId', 'receiverPartyId', 'unit'] as const;

export const BATCH_WORKBENCH_FIELDS = ['plannedQty', 'receiverPartyId', 'dateSupplierPromised', 'dateBuyerConfirmed', 'dateFactoryRequired'] as const;

const COMPONENT_LINE_ORIGIN = 'import_procurement_component';
const FACTORY_BATCH_ORIGIN = 'from_factory_demand';
const FACTORY_OWNED_BATCH_FIELD = 'dateFactoryRequired';

export function assertWritable({ entity, fields, origin }: { readonly entity: OwnershipEntity; readonly fields: readonly string[]; readonly origin: string }): void {
  for (const field of fields) {
    if (!isWritable({ entity, field, origin })) {
      throw new DomainRuleViolation({ code: 'FIELD_OWNED_BY_IMPORT', message: '这个字段不能在工作台改', details: { field } });
    }
  }
}

export function isWritable({ entity, field, origin }: { readonly entity: OwnershipEntity; readonly field: string; readonly origin: string }): boolean {
  if (entity === 'factory_report') return false;
  if (entity === 'party' || entity === 'item') return true;
  if (entity === 'product') return origin === 'workbench';
  if (entity === 'delivery_batch') return batchFieldWritable(field, origin);
  return lineFieldWritable(field, origin);
}

function lineFieldWritable(field: string, origin: string): boolean {
  if (isListed(ORDER_LINE_WORKBENCH_FIELDS, field)) return field !== 'unit' || origin !== COMPONENT_LINE_ORIGIN;
  if (isListed(ORDER_LINE_IMPORT_FIELDS, field)) return origin !== 'import_po_master' && origin !== COMPONENT_LINE_ORIGIN;
  return false;
}

function batchFieldWritable(field: string, origin: string): boolean {
  if (!isListed(BATCH_WORKBENCH_FIELDS, field)) return false;
  return !(field === FACTORY_OWNED_BATCH_FIELD && origin === FACTORY_BATCH_ORIGIN);
}

function isListed(fields: readonly string[], field: string): boolean {
  return fields.some((item) => item === field);
}
