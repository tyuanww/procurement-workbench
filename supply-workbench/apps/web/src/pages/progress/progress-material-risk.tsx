import type { ReactNode } from 'react';
import type { ProgressMaterialRisk, ProgressRow } from '../../features/progress/index.js';
import { formatQuantity } from '../../shared/ui/format.js';
import { space } from '../../theme/tokens.js';

export function materialRiskState(risks: readonly ProgressMaterialRisk[]): string {
  if (risks.length === 0) return '';
  return risks.some((risk) => risk.overdueDays !== null) ? '物料逾期' : '物料待发';
}

export function ProgressNextAction({ row }: { readonly row: ProgressRow }): ReactNode {
  if (row.materialRisks.length === 0) return row.nextLabel ?? '暂无已核实动作';
  return (
    <div style={{ maxWidth: 360, overflowWrap: 'anywhere' }}>
      {row.nextLabel}
      <ul style={{ margin: 0, paddingInlineStart: space[3] }}>
        {row.materialRisks.map((risk) => (
          <li key={risk.batchId}>
            {risk.label} · 第 {risk.seq} 批 · {risk.overdueDays === null ? '物料待发' : `逾期 ${risk.overdueDays} 天`} · 未发 {formatQuantity(risk.unshippedQty)} {risk.unit}
          </li>
        ))}
      </ul>
    </div>
  );
}
