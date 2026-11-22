import { defineEnum } from './define-enum.js';

const templateId = defineEnum(
  ['po-master-v1', 'factory-progress-v1', 'product-archive-v1', 'bom-v1', 'owner-map-v1', 'planner-sheet-v1', 'batch-confirmed-arrival-v1'] as const,
  {
    'po-master-v1': '采购订单总表',
    'factory-progress-v1': '代工厂进度',
    'product-archive-v1': '产品档案',
    'bom-v1': 'BOM',
    'owner-map-v1': '负责人映射',
    'planner-sheet-v1': '排产作业表',
    'batch-confirmed-arrival-v1': '采购确认到货日',
  },
);

const importStatus = defineEnum(
  ['parsed', 'committed', 'discarded', 'failed'] as const,
  {
    parsed: '待确认',
    committed: '已提交',
    discarded: '已放弃',
    failed: '解析失败',
  },
);

const importAction = defineEnum(['create', 'update', 'unchanged', 'conflict', 'skip'] as const, {
  create: '新建',
  update: '更新',
  unchanged: '不变',
  conflict: '冲突',
  skip: '跳过',
});

const linkStatus = defineEnum(['linked', 'unlinked', 'ambiguous', 'manual'] as const, {
  linked: '已关联',
  unlinked: '未关联',
  ambiguous: '对上多条',
  manual: '人工挂接',
});

export const TEMPLATE_IDS = templateId.values;
export const TEMPLATE_ID_LABELS = templateId.labels;
export const templateIdLabel = templateId.label;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const CONFIRMED_ARRIVAL_SHEET = TEMPLATE_ID_LABELS['batch-confirmed-arrival-v1'];
export const UNCONFIRMED_ARRIVAL = '未确认';
export const CONFIRMED_ARRIVAL_COLUMNS = {
  batchId: '要货批次ID',
  po: 'PO单号',
  name: '品名',
  sequence: '批次序号',
  warehouse: '仓库',
  exportedDate: '导出时确认到货日',
  date: '采购确认到货日',
  reason: '改期原因',
  exportedReceiverPartyId: '导出时收货方ID',
  exportedLineId: '导出时订单行ID',
} as const;

export const IMPORT_STATUSES = importStatus.values;
export const IMPORT_STATUS_LABELS = importStatus.labels;
export const importStatusLabel = importStatus.label;
export type ImportStatus = (typeof IMPORT_STATUSES)[number];

export const IMPORT_ACTIONS = importAction.values;
export const IMPORT_ACTION_LABELS = importAction.labels;
export const importActionLabel = importAction.label;
export type ImportAction = (typeof IMPORT_ACTIONS)[number];

export const LINK_STATUSES = linkStatus.values;
export const LINK_STATUS_LABELS = linkStatus.labels;
export const linkStatusLabel = linkStatus.label;
export type LinkStatus = (typeof LINK_STATUSES)[number];
