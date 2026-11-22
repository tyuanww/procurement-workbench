import { defineEnum } from './define-enum.js';

const permissionAction = defineEnum(
  [
    'dashboard.read',
    'reports.read',
    'data.read',
    'imports.read',
    'master.read',
    'products.read',
    'plan.read',
    'today.read',
    'search.read',
    'session.read',
    'lines.write',
    'records.write',
    'imports.write',
    'master.review',
    'products.maintain',
    'reports.generate',
    'reports.export',
    'admin',
  ] as const,
  {
    'dashboard.read': '读取管理看板',
    'reports.read': '读取周报',
    'data.read': '读取订单与主数据',
    'imports.read': '读取导入批次',
    'master.read': '读取主数据审核',
    'products.read': '读取产品档案',
    'plan.read': '读取排期',
    'today.read': '读取今日',
    'search.read': '读取全局搜索',
    'session.read': '读取当前会话',
    'lines.write': '订单行写操作',
    'records.write': '批次与记录写操作',
    'imports.write': '上传并提交导入',
    'master.review': '审核主数据',
    'products.maintain': '维护产品档案',
    'reports.generate': '生成周报',
    'reports.export': '导出周报',
    admin: '用户、设置、审计',
  },
);

const errorCode = defineEnum(
  [
    'UNAUTHENTICATED',
    'FORBIDDEN',
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'STATE_CONFLICT',
    'UNDO_WINDOW_EXPIRED',
    'UNDO_NOT_OWNER',
    'FIELD_OWNED_BY_IMPORT',
    'DATE_CHANGE_REASON_REQUIRED',
    'BATCH_HAS_RECORDS',
    'IMPORT_TEMPLATE_UNKNOWN',
    'IMPORT_FACTORY_REQUIRED',
    'IMPORT_NOT_PARSED',
    'IMPORT_HAS_CONFLICTS',
    'FORBIDDEN_PAIR_CONFIRM_REQUIRED',
    'FEISHU_NOT_CONFIGURED',
    'FILE_TOO_LARGE',
    'FILE_TYPE_NOT_ALLOWED',
    'RATE_LIMITED',
    'INTERNAL',
  ] as const,
  {
    UNAUTHENTICATED: '没登录或会话过期',
    FORBIDDEN: '角色不允许',
    VALIDATION_FAILED: '请求不合法',
    NOT_FOUND: '找不到',
    STATE_CONFLICT: '当前状态不允许这个操作',
    UNDO_WINDOW_EXPIRED: '超过 10 秒撤销窗口',
    UNDO_NOT_OWNER: '只能撤销自己的记录',
    FIELD_OWNED_BY_IMPORT: '想改的字段归导入所有',
    DATE_CHANGE_REASON_REQUIRED: '修改已有确认到货日没写原因',
    BATCH_HAS_RECORDS: '批次已有记录，不能删除',
    IMPORT_TEMPLATE_UNKNOWN: '识别不出模板，也没有手选',
    IMPORT_FACTORY_REQUIRED: '代工厂模板没选代工厂',
    IMPORT_NOT_PARSED: '批次不是待确认状态',
    IMPORT_HAS_CONFLICTS: '还有未处理的冲突行',
    FORBIDDEN_PAIR_CONFIRM_REQUIRED: '这两个名字属于禁止合并组合，需要二次确认',
    FEISHU_NOT_CONFIGURED: '没配置飞书应用',
    FILE_TOO_LARGE: '超过大小上限',
    FILE_TYPE_NOT_ALLOWED: '文件类型不允许',
    RATE_LIMITED: '尝试次数过多',
    INTERNAL: '内部错误',
  },
);

const missingReason = defineEnum(
  ['not_provided', 'unparseable', 'no_matching_record', 'not_applicable', 'no_source'] as const,
  {
    not_provided: '未填写',
    unparseable: '原文无法识别',
    no_matching_record: '代工厂表无对应记录',
    not_applicable: '不适用',
    no_source: '暂无数据来源',
  },
);

export const PERMISSION_ACTIONS = permissionAction.values;
export const PERMISSION_ACTION_LABELS = permissionAction.labels;
export const permissionActionLabel = permissionAction.label;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const ERROR_CODES = errorCode.values;
export const ERROR_CODE_LABELS = errorCode.labels;
export const errorCodeLabel = errorCode.label;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const MISSING_REASONS = missingReason.values;
export const MISSING_REASON_LABELS = missingReason.labels;
export const missingReasonLabel = missingReason.label;
export type MissingReason = (typeof MISSING_REASONS)[number];

export const DOMAIN_RULE_CODES = [
  'STATE_CONFLICT',
  'DATE_CHANGE_REASON_REQUIRED',
  'FIELD_OWNED_BY_IMPORT',
  'BATCH_HAS_RECORDS',
  'UNDO_WINDOW_EXPIRED',
  'UNDO_NOT_OWNER',
  'FORBIDDEN_PAIR_CONFIRM_REQUIRED',
] as const satisfies readonly ErrorCode[];

export type DomainRuleCode = (typeof DOMAIN_RULE_CODES)[number];
