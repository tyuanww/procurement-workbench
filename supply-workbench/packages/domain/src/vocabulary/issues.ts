import { defineEnum, vocabularyText } from './define-enum.js';

const issueSeverity = defineEnum(['error', 'conflict', 'warning', 'info'] as const, {
  error: '不能导入',
  conflict: '必须人选',
  warning: '警告',
  info: '只记录',
});

export const ISSUE_SEVERITIES = issueSeverity.values;
export const ISSUE_SEVERITY_LABELS = issueSeverity.labels;
export const issueSeverityLabel = issueSeverity.label;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const ISSUE_CATALOG = [
  { code: 'HEADER_NOT_FOUND', severity: 'error', label: '必需的 sheet 或表头找不到' },
  { code: 'SHEET_IGNORED', severity: 'info', label: '这张表不导入' },
  { code: 'ROW_REPEATED_HEADER', severity: 'info', label: '表中间又出现一遍表头' },
  { code: 'ROW_EMPTY_LIKE', severity: 'info', label: '只有标记，没有业务内容' },
  { code: 'ROW_NO_IDENTITY', severity: 'error', label: '单号、编码、条码、品名全空' },
  { code: 'OWNER_NAME_MISSING', severity: 'error', label: '负责人为空' },
  { code: 'DATE_NO_YEAR', severity: 'warning', label: '日期没有年份' },
  { code: 'DATE_TEXT', severity: 'warning', label: '日期格里是文字' },
  { code: 'DATE_INVALID', severity: 'warning', label: '看起来像日期但不合法' },
  { code: 'DATE_OUT_OF_RANGE', severity: 'warning', label: '日期超出合理范围' },
  { code: 'QTY_TEXT', severity: 'warning', label: '数量格里是文字' },
  { code: 'QTY_WAN', severity: 'info', label: '按「万」换算' },
  { code: 'QTY_THOUSANDS_SEP', severity: 'info', label: '去掉了千分位' },
  { code: 'FORMULA_ERROR', severity: 'warning', label: '公式错误值' },
  { code: 'FORMULA_VALUE', severity: 'info', label: '取的是公式缓存值' },
  { code: 'DERIVED_ZERO_NO_SOURCE', severity: 'warning', label: '代工厂公式算出 0，但来源表里没有对应行' },
  { code: 'DERIVED_NEGATIVE', severity: 'info', label: '代工厂公式算出负数' },
  { code: 'MERGED_FILL', severity: 'info', label: '值来自合并单元格的左上角' },
  { code: 'CONTEXT_INHERITED', severity: 'info', label: '物料行从上方的块继承了单号' },
  { code: 'PO_PLACEHOLDER', severity: 'warning', label: '单号格是占位' },
  { code: 'PO_MULTI', severity: 'warning', label: '一格里有多个单号' },
  { code: 'PO_EXTRA_TEXT', severity: 'warning', label: '单号后面带了别的字' },
  { code: 'PO_P0_PREFIX', severity: 'warning', label: 'P0 开头，可能是 PO 录错' },
  { code: 'PO_UNKNOWN_FORMAT', severity: 'warning', label: '有内容但认不出格式' },
  { code: 'BARCODE_SUFFIX', severity: 'info', label: '条码带 -数字 后缀' },
  { code: 'BARCODE_LENGTH', severity: 'warning', label: '条码不是 13 位' },
  { code: 'CODE_CASE', severity: 'info', label: '编码大小写已规范' },
  { code: 'CODE_UNKNOWN_PATTERN', severity: 'warning', label: '编码认不出类型' },
  { code: 'STATUS_UNKNOWN', severity: 'warning', label: '总表状态不是已完成、进行中、未开始' },
  { code: 'PARTY_PENDING', severity: 'info', label: '主体名称还没审核' },
  { code: 'CODE_PENDING', severity: 'info', label: '编码还没审核' },
  { code: 'KEY_DUPLICATE_IN_FILE', severity: 'warning', label: '同一文件里候选键重复' },
  { code: 'KEY_AMBIGUOUS_EXISTING', severity: 'conflict', label: '库里有多条现有订单行都能对上' },
  { code: 'FACTORY_MISMATCH', severity: 'warning', label: '供应商列和上传时选的代工厂不一致' },
  { code: 'PRODUCT_FIELD_KEPT', severity: 'info', label: '这个字段已在工作台改过，保留工作台的值' },
  { code: 'ARRIVAL_BATCH_ID_MISSING', severity: 'error', label: '缺少要货批次 ID' },
  { code: 'ARRIVAL_BATCH_NOT_FOUND', severity: 'error', label: '系统里找不到要货批次' },
  { code: 'ARRIVAL_BATCH_NOT_EDITABLE', severity: 'error', label: '已关闭或已取消的批次不能改确认日' },
  { code: 'ARRIVAL_EXPORTED_DATE_INVALID', severity: 'error', label: '导出时的确认日无效，请重新导出' },
  { code: 'ARRIVAL_EXPORTED_RECEIVER_MISSING', severity: 'error', label: '缺少导出时的收货方 ID，请重新导出' },
  { code: 'ARRIVAL_BATCH_RECEIVER_CHANGED', severity: 'conflict', label: '该批次的收货方已变更，请重新导出核对' },
  { code: 'ARRIVAL_EXPORTED_BATCH_IDENTITY_MISSING', severity: 'error', label: '缺少导出时的订单行或批次序号，请重新导出' },
  { code: 'ARRIVAL_BATCH_IDENTITY_CHANGED', severity: 'conflict', label: '批次 ID 与订单行或批次序号不符，请重新导出核对' },
  { code: 'ARRIVAL_CONFIRM_DATE_CHANGED', severity: 'conflict', label: '工作台确认日已变更，请重新导出核对' },
  { code: 'ARRIVAL_CONFIRM_DATE_REASON_MISSING', severity: 'error', label: '修改已有确认日须填写改期原因' },
  { code: 'ARRIVAL_CONFIRM_DATE_DUPLICATE', severity: 'conflict', label: '同一批次在表中填了不同的确认日' },
] as const satisfies readonly { code: string; severity: IssueSeverity; label: string }[];

export const ISSUE_CODES = ISSUE_CATALOG.map((item) => item.code);
export type IssueCode = (typeof ISSUE_CATALOG)[number]['code'];

export function issueLabel(code: IssueCode): string {
  for (const item of ISSUE_CATALOG) {
    if (item.code === code) return item.label;
  }
  throw new Error(`问题码没有中文名: ${code}`);
}

export function issueText(code: string): string {
  return vocabularyText({ values: ISSUE_CODES, label: issueLabel }, code);
}
