import { defineEnum } from './define-enum.js';

const contactRole = defineEnum(
  ['product_info', 'packaging', 'purchasing', 'production_coord', 'quality', 'warehouse'] as const,
  {
    product_info: '产品资料',
    packaging: '包材',
    purchasing: '采购',
    production_coord: '生产协调',
    quality: '质量',
    warehouse: '仓储',
  },
);

const channelMatch = defineEnum(['exact', 'sibling_channel'] as const, {
  exact: '本条码',
  sibling_channel: '同基础码',
});

const purchaseScope = defineEnum(['all_channels', 'exact'] as const, {
  all_channels: '全部渠道',
  exact: '只看本条码',
});

const imageSlot = defineEnum(['inner', 'outer'] as const, {
  inner: '内包装',
  outer: '外包装',
});

const imageSource = defineEnum(['import', 'upload'] as const, {
  import: '档案',
  upload: '工作台上传',
});

const fieldSource = defineEnum(['import', 'workbench'] as const, {
  import: '档案',
  workbench: '工作台',
});

export const PRODUCT_CONTACT_ROLES = contactRole.values;
export const PRODUCT_CONTACT_ROLE_LABELS = contactRole.labels;
export const productContactRoleLabel = contactRole.label;
export type ProductContactRole = (typeof PRODUCT_CONTACT_ROLES)[number];

export const CHANNEL_MATCHES = channelMatch.values;
export const CHANNEL_MATCH_LABELS = channelMatch.labels;
export const channelMatchLabel = channelMatch.label;
export type ChannelMatch = (typeof CHANNEL_MATCHES)[number];

export const PURCHASE_SCOPES = purchaseScope.values;
export const PURCHASE_SCOPE_LABELS = purchaseScope.labels;
export const purchaseScopeLabel = purchaseScope.label;
export type PurchaseScope = (typeof PURCHASE_SCOPES)[number];

export const IMAGE_SLOTS = imageSlot.values;
export const IMAGE_SLOT_LABELS = imageSlot.labels;
export const imageSlotLabel = imageSlot.label;
export type ImageSlot = (typeof IMAGE_SLOTS)[number];

export const IMAGE_SOURCES = imageSource.values;
export const IMAGE_SOURCE_LABELS = imageSource.labels;
export const imageSourceLabel = imageSource.label;
export type ImageSource = (typeof IMAGE_SOURCES)[number];

export const FIELD_SOURCES = fieldSource.values;
export const FIELD_SOURCE_LABELS = fieldSource.labels;
export const fieldSourceLabel = fieldSource.label;
export type FieldSource = (typeof FIELD_SOURCES)[number];
