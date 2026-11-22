export function groupByFiling(products: readonly { readonly id: string; readonly filingName: string | null }[]) {
  const groups = new Map<string, string[]>();
  for (const product of products) {
    const key = product.filingName ?? '未备案';
    groups.set(key, [...(groups.get(key) ?? []), product.id]);
  }
  return [...groups].map(([filingName, ids]) => ({ filingName, ids }));
}

export function isChannelVariant(barcodeRaw: string): boolean {
  return /-\d+$/.test(barcodeRaw);
}

export function stockMissingText(reason: string): string {
  return `${reason}。去主数据审核`;
}

export function materialsCopy(): string {
  return '组成物料按子件码关联，不判断是否到齐';
}

export function imageLabel(hasImage: boolean): string {
  return hasImage ? '查看图片' : '无图';
}
