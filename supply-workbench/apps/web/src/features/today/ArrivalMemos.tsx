import { Link } from 'react-router';
import type { TodayResponse } from '@sw/contracts';
import { SectionGroup, SectionRow } from '../../shared/ui/section.js';
import { statusColor, text } from '../../theme/tokens.js';

type Memo = TodayResponse['arrivalMemos'][number];

const labels = {
  in_transit: '在途待收',
  due_today: '今日应到',
  overdue: '到仓逾期',
} satisfies Record<Memo['status'], string>;

export function ArrivalMemos({ memos }: { readonly memos: readonly Memo[] }) {
  if (memos.length === 0) return null;
  return (
    <SectionGroup title="到仓备忘录" meta={`${memos.length} 批`}>
      {memos.map((memo) => (
        <SectionRow key={memo.batchId} action={<Link to={`/lines/${encodeURIComponent(memo.line.id)}`}>订单详情</Link>}>
          <div>{memo.line.poRaw ?? '—'} · {memo.line.nameRaw ?? '—'} · {memo.warehouse ?? '收货方未命名'}</div>
          <div style={{ color: memo.status === 'overdue' ? statusColor.danger.text : text.secondary }}>
            {labels[memo.status]} · 待收 {quantity(memo.inTransitQty, memo.unit)} · 实收 {quantity(memo.receivedQty, memo.unit)} · {memo.confirmedDate ?? '确认日未定'}
          </div>
        </SectionRow>
      ))}
    </SectionGroup>
  );
}

function quantity(value: number, unit: string): string {
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 4 })} ${unit}`;
}
