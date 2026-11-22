import type { FactoryRowMatchRef, OrderLineMatchRef } from './views.js';

type Basis = 'po' | 'item_code' | 'barcode';

type Tier = {
  readonly basis: Basis;
  readonly line: (line: OrderLineMatchRef) => string | null;
  readonly row: (row: FactoryRowMatchRef) => string | null;
};

const TIERS: readonly Tier[] = [
  { basis: 'po', line: (line) => line.poNorm, row: (row) => row.poNorm },
  { basis: 'item_code', line: (line) => line.itemCodeNorm, row: (row) => row.itemCodeNorm },
  { basis: 'barcode', line: (line) => line.barcodeNorm, row: (row) => row.barcodeNorm },
];

export type FactoryMatch =
  | { readonly kind: 'matched'; readonly row: FactoryRowMatchRef; readonly line: OrderLineMatchRef; readonly basis: Basis }
  | { readonly kind: 'conflict'; readonly row: FactoryRowMatchRef }
  | { readonly kind: 'none'; readonly row: FactoryRowMatchRef };

/** 单行匹配：PO 优先；命中多个时用品号、条码逐级收窄；仍不唯一就是冲突。 */
export function matchFactoryRow(row: FactoryRowMatchRef, lines: readonly OrderLineMatchRef[]): FactoryMatch {
  let pool: readonly OrderLineMatchRef[] | undefined;
  for (const tier of TIERS) {
    const key = textOf(tier.row(row));
    if (key === null) continue;
    const hits = (pool ?? lines).filter((line) => textOf(tier.line(line)) === key);
    if (hits.length === 1) {
      const line = hits[0];
      if (line === undefined) return { kind: 'none', row };
      return { kind: 'matched', row, line, basis: tier.basis };
    }
    if (hits.length > 1) {
      pool = hits;
      continue;
    }
    // 已收窄的池子没有被这个键命中时，保留池子交给后面的键继续收窄。
  }
  return pool === undefined ? { kind: 'none', row } : { kind: 'conflict', row };
}

/** 同一订单行只接受一个工厂行；后来的行记为冲突，避免重复关联。 */
export function planFactoryLinks(input: { readonly orderLines: readonly OrderLineMatchRef[]; readonly factoryRows: readonly FactoryRowMatchRef[] }): readonly FactoryMatch[] {
  const claimed = new Set<string>();
  const results: FactoryMatch[] = [];
  for (const row of input.factoryRows) {
    if (row.linkStatus === 'manual') continue;
    const result = matchFactoryRow(row, input.orderLines);
    if (result.kind === 'matched') {
      if (claimed.has(result.line.orderLineId)) {
        results.push({ kind: 'conflict', row });
        continue;
      }
      claimed.add(result.line.orderLineId);
    }
    results.push(result);
  }
  return results;
}

function textOf(value: string | null): string | null {
  if (value === null) return null;
  const text = value.trim();
  return text === '' ? null : text;
}
