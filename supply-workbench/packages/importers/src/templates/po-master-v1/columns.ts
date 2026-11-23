export const PO_MASTER_SHEET_NAME = '采购订单总表';

/** 表头去掉空白和换行后必须正好有这 17 列，顺序不限。 */
export const REQUIRED_COLUMNS = [
  'OA需求编号',
  '供应商',
  '产品名称',
  '产品条码',
  '订单数量',
  'OA提报时间',
  'OA需求时间',
  '计划时长',
  '采购订单号',
  '实际开始（半成品订单创建）',
  '订单首批交付时间',
  '实际结束（成品交付完成）',
  '实际时长',
  '工厂成品库存',
  '实际发货数量',
  '订单数量差额',
  '状态',
] as const;

export const OPTIONAL_COLUMNS = ['采购负责人', '工厂'] as const;

export const KNOWN_STATUS = new Set(['已完成', '进行中', '未开始']);

export function compactHeader(text: string): string {
  return text.replace(/\s+/gu, '');
}
