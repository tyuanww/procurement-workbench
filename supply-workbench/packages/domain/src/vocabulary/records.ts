import { defineEnum } from './define-enum.js';

const exceptionType = defineEnum(
  ['bom_change', 'cancel', 'delay', 'qty_mismatch', 'quality', 'identity', 'other'] as const,
  {
    bom_change: 'BOM 变更',
    cancel: '取消',
    delay: '延期',
    qty_mismatch: '数量差异',
    quality: '质量',
    identity: '编码问题',
    other: '其他',
  },
);

const exceptionStatus = defineEnum(['open', 'closed'] as const, {
  open: '未关闭',
  closed: '已关闭',
});

const followUpKind = defineEnum(['call', 'message', 'promise', 'note'] as const, {
  call: '电话',
  message: '消息',
  promise: '对方承诺',
  note: '备注',
});

const receiptCategory = defineEnum(['packaging', 'finished', 'raw', 'unknown'] as const, {
  packaging: '包材',
  finished: '成品',
  raw: '原料',
  unknown: '未分类',
});

const shipmentSource = defineEnum(['manual', 'factory_report_adopted'] as const, {
  manual: '手工',
  factory_report_adopted: '采纳代工厂出货',
});

const receiptSource = defineEnum(['workbench', 'srm'] as const, {
  workbench: '工作台登记',
  srm: 'SRM',
});

const lineOrigin = defineEnum(
  ['import_po_master', 'import_procurement_component', 'from_factory_in_transit', 'from_factory_demand', 'manual'] as const,
  {
    import_po_master: '采购订单总表',
    import_procurement_component: '采购工作簿子件',
    from_factory_in_transit: '代工厂在途',
    from_factory_demand: '代工厂需求',
    manual: '手工',
  },
);

const batchOrigin = defineEnum(['manual', 'from_factory_demand', 'from_po_master_hint'] as const, {
  manual: '手工',
  from_factory_demand: '代工厂需求',
  from_po_master_hint: '总表首批提示',
});

const dateChangeField = defineEnum(['dateBuyerConfirmed', 'dateSupplierPromised'] as const, {
  dateBuyerConfirmed: '确认到货日',
  dateSupplierPromised: '供应商承诺日',
});

const timelineKind = defineEnum(
  ['date_change', 'shipment', 'receipt', 'delivery_note', 'status_change', 'follow_up', 'exception'] as const,
  {
    date_change: '改期',
    shipment: '发货',
    receipt: '收货',
    delivery_note: '送货单',
    status_change: '状态变更',
    follow_up: '跟进',
    exception: '异常',
  },
);

export const EXCEPTION_TYPES = exceptionType.values;
export const EXCEPTION_TYPE_LABELS = exceptionType.labels;
export const exceptionTypeLabel = exceptionType.label;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export const EXCEPTION_STATUSES = exceptionStatus.values;
export const EXCEPTION_STATUS_LABELS = exceptionStatus.labels;
export const exceptionStatusLabel = exceptionStatus.label;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

export const FOLLOW_UP_KINDS = followUpKind.values;
export const FOLLOW_UP_KIND_LABELS = followUpKind.labels;
export const followUpKindLabel = followUpKind.label;
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number];

export const RECEIPT_CATEGORIES = receiptCategory.values;
export const RECEIPT_CATEGORY_LABELS = receiptCategory.labels;
export const receiptCategoryLabel = receiptCategory.label;
export type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

export const SHIPMENT_SOURCES = shipmentSource.values;
export const SHIPMENT_SOURCE_LABELS = shipmentSource.labels;
export const shipmentSourceLabel = shipmentSource.label;
export type ShipmentSource = (typeof SHIPMENT_SOURCES)[number];

export const RECEIPT_SOURCES = receiptSource.values;
export const RECEIPT_SOURCE_LABELS = receiptSource.labels;
export const receiptSourceLabel = receiptSource.label;
export type ReceiptSource = (typeof RECEIPT_SOURCES)[number];

export const LINE_ORIGINS = lineOrigin.values;
export const LINE_ORIGIN_LABELS = lineOrigin.labels;
export const lineOriginLabel = lineOrigin.label;
export type LineOrigin = (typeof LINE_ORIGINS)[number];

export const BATCH_ORIGINS = batchOrigin.values;
export const BATCH_ORIGIN_LABELS = batchOrigin.labels;
export const batchOriginLabel = batchOrigin.label;
export type BatchOrigin = (typeof BATCH_ORIGINS)[number];

export const DATE_CHANGE_FIELDS = dateChangeField.values;
export const DATE_CHANGE_FIELD_LABELS = dateChangeField.labels;
export const dateChangeFieldLabel = dateChangeField.label;
export type DateChangeField = (typeof DATE_CHANGE_FIELDS)[number];

export const TIMELINE_KINDS = timelineKind.values;
export const TIMELINE_KIND_LABELS = timelineKind.labels;
export const timelineKindLabel = timelineKind.label;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];
