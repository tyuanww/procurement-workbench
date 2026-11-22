export const REQUIRED_COLUMNS = [
  '备案名称',
  '备案号',
  'SKU名称',
  '产品条码',
  '净含量',
  '内包装图片',
  '外包装图片',
  '箱规',
  '外包装尺寸（长*宽*高）（单位：mm）',
  '项目对接人',
] as const;

export const INNER_IMAGE = '内包装图片';
export const OUTER_IMAGE = '外包装图片';

export function compactHeader(text: string): string {
  return text.replace(/\s+/gu, '');
}
