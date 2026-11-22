import { defineEnum } from './define-enum.js';

const role = defineEnum(['buyer', 'reviewer', 'manager', 'lead', 'admin'] as const, {
  buyer: '采购员',
  reviewer: '主数据审核人',
  manager: '管理层',
  lead: '供应链负责人',
  admin: '管理员',
});

const lane = defineEnum(['finished', 'material'] as const, {
  finished: '成品线',
  material: '物料线',
});

const poFormat = defineEnum(
  ['PO14', 'PO10', 'P0_10', 'P0_14', 'HZSY', 'SY', 'PUR3500', 'PUR3505', 'NONE', 'OTHER'] as const,
  {
    PO14: '14 位采购单号',
    PO10: '10 位采购单号',
    P0_10: 'P0 开头的 10 位单号',
    P0_14: 'P0 开头的 14 位单号',
    HZSY: 'HZSY 单号',
    SY: 'SY 单号',
    PUR3500: '3500 物料采购单',
    PUR3505: '3505 物料采购单',
    NONE: '没有单号',
    OTHER: '认不出的单号',
  },
);

const codeType = defineEnum(
  ['erp_70', 'pack_30', 'raw_k', 'semi_50', 'bom_part', 'barcode_69', 'supplier_sku', 'other'] as const,
  {
    erp_70: '品号',
    pack_30: '包材码',
    raw_k: '原料码',
    semi_50: '半成品码',
    bom_part: 'BOM 子件码',
    barcode_69: '69 码',
    supplier_sku: '供应商品号',
    other: '其他编码',
  },
);

const itemKind = defineEnum(['finished', 'packaging', 'raw', 'semi', 'unknown'] as const, {
  finished: '成品',
  packaging: '包材',
  raw: '原料',
  semi: '半成品',
  unknown: '未分类',
});

const reviewStatus = defineEnum(['pending', 'approved', 'rejected'] as const, {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
});

export const ROLES = role.values;
export const ROLE_LABELS = role.labels;
export const roleLabel = role.label;
export type Role = (typeof ROLES)[number];

export const LANES = lane.values;
export const LANE_LABELS = lane.labels;
export const laneLabel = lane.label;
export type Lane = (typeof LANES)[number];

export const PO_FORMATS = poFormat.values;
export const PO_FORMAT_LABELS = poFormat.labels;
export const poFormatLabel = poFormat.label;
export type PoFormat = (typeof PO_FORMATS)[number];

export const CODE_TYPES = codeType.values;
export const CODE_TYPE_LABELS = codeType.labels;
export const codeTypeLabel = codeType.label;
export type CodeType = (typeof CODE_TYPES)[number];

export const ITEM_KINDS = itemKind.values;
export const ITEM_KIND_LABELS = itemKind.labels;
export const itemKindLabel = itemKind.label;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const REVIEW_STATUSES = reviewStatus.values;
export const REVIEW_STATUS_LABELS = reviewStatus.labels;
export const reviewStatusLabel = reviewStatus.label;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
