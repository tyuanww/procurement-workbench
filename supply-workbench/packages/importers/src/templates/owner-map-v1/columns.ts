export const OWNER_MAP_COLUMNS = ['采购订单号', '负责人'] as const;

export function compactHeader(text: string): string {
  return text.replace(/\s+/gu, '');
}
