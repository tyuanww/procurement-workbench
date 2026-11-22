export const BOM_COLUMNS = ['产品条码', '产品名称', '成品翻单次数', '累计数量', '子件条码', '子件名称'] as const;

export function compactHeader(text: string): string {
  return text.replace(/\s+/gu, '');
}
