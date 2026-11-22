import type { OrderLineRow, StoreProgressMaterial, TodoItemView } from '@sw/contracts';
import { isOpenBatch } from '@sw/domain';

type BatchRisk = {
  readonly batchId: string;
  readonly seq: number;
  readonly unshippedQty: number;
  readonly unit: string;
  readonly overdueDays: number | null;
};

export type ProgressMaterialRisk = BatchRisk & {
  readonly materialId: string;
  readonly label: string;
};

export function progressMaterialRisks(items: readonly TodoItemView[]): ReadonlyMap<string, readonly BatchRisk[]> {
  const risks = new Map<string, BatchRisk[]>();
  const seen = new Set<string>();
  for (const item of items) {
    const lineId = item.refs.orderLineId;
    const risk = provenRisk(item);
    if (lineId === undefined || risk === null || seen.has(risk.batchId)) continue;
    seen.add(risk.batchId);
    const linked = risks.get(lineId);
    if (linked === undefined) risks.set(lineId, [risk]);
    else linked.push(risk);
  }
  return risks;
}

export function risksForLine(line: Pick<OrderLineRow, 'storeProgress'>, risks: ReadonlyMap<string, readonly BatchRisk[]>): ProgressMaterialRisk[] {
  return (line.storeProgress?.materials ?? []).flatMap((material) => (risks.get(material.id) ?? []).map((risk) => ({
    ...risk, materialId: material.id, label: materialRiskLabel(material),
  })));
}

function materialRiskLabel(material: StoreProgressMaterial): string {
  return [material.nameRaw, material.codeRaw, material.poRaw].filter(Boolean).join(' · ') || '关联采购事项';
}

function provenRisk(item: TodoItemView): BatchRisk | null {
  const batch = item.batch;
  const facts = batch?.fulfillment;
  if (item.subject !== 'batch' || batch === null || !isOpenBatch(batch.status) || !item.reasons.includes('unshipped')) return null;
  if (facts === undefined || facts.unit === null || facts.unshippedQty === null || facts.unshippedQty <= 0) return null;
  return {
    batchId: batch.id, seq: batch.seq, unshippedQty: facts.unshippedQty, unit: facts.unit,
    overdueDays: provenOverdueDays(item, batch.dateBuyerConfirmed),
  };
}

function provenOverdueDays(item: TodoItemView, confirmedDate: string | null): number | null {
  return confirmedDate !== null && item.reasons.includes('overdue') && (item.overdueDays ?? 0) > 0 ? item.overdueDays : null;
}
