import type { ProcurementStore } from '@sw/domain';
import type { ProcurementSource } from '../ports/procurement-preview.js';

export type StoreProgressSource = ProcurementSource & { readonly importBatchId: string };

export type StoreProgressMaterial = {
  readonly id: string;
  readonly nameRaw: string | null;
  readonly codeRaw: string | null;
  readonly poRaw: string | null;
  readonly source: StoreProgressSource;
  readonly completed: boolean;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly deliveryProgressRaw: string | null;
  readonly reportedGap: number | null;
};

export type StoreProgressLine = {
  readonly store: Exclude<ProcurementStore, 'all'>;
  readonly sources: readonly (StoreProgressSource & { readonly oaRaw: string | null })[];
  readonly materials: readonly StoreProgressMaterial[];
};

const SENT = /(?:已送(?:达)?|已交付|已发货)[ \t]*[:：]?[ \t]*(\d+(?:,\d{3})*(?:\.\d+)?)(万|[wW])?[ \t]*(个|件|套|片|张|支|盒|瓶|袋|箱|卷|只|枚|颗|条|包|千克|公斤|克|毫升|升|吨|kg|g|ml|l|t)?(?=$|[\s，,；;。])/gu;

const WAN = 10_000;

export function reportedProcurementGap({ quantity, unit, deliveryProgressRaw }: Pick<StoreProgressMaterial, 'quantity' | 'unit' | 'deliveryProgressRaw'>): number | null {
  if (quantity === null || unit === null || deliveryProgressRaw === null) return null;
  const reported = reportedProcurementQuantity(deliveryProgressRaw, unit);
  return reported === null || reported > quantity ? null : quantity - reported;
}

/** 同一来源行的数量缺单位时保留无单位数值，调用方不能据此计入实物量。 */
export function reportedProcurementQuantity(raw: string, unit: string | null): number | null {
  const text = raw.normalize('NFKC');
  const [match, ...others] = text.matchAll(SENT);
  if (match === undefined || others.length > 0) return null;
  if (hasNegativeQualifier(text, match.index)) return null;
  const [, amount, scale, reportedUnit] = match;
  if (amount === undefined || (reportedUnit !== undefined && reportedUnit !== unit?.normalize('NFKC'))) return null;
  const reported = Number(amount.replaceAll(',', '')) * (scale === undefined ? 1 : WAN);
  return Number.isFinite(reported) ? reported : null;
}

function hasNegativeQualifier(text: string, index: number): boolean {
  const prefix = text.slice(0, index).split(/[,;。]/u).at(-1) ?? '';
  return /未|待核实|预计|计划|可能|预报|无需|否认/u.test(prefix);
}
