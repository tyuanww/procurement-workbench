import { Link } from 'react-router';
import { useEffect, useRef } from 'react';
import type { TodayResponse } from '@sw/contracts';
import { SectionGroup, SectionRow } from '../../shared/ui/section.js';
import { statusColor, text } from '../../theme/tokens.js';

type Memo = TodayResponse['arrivalMemos'][number];

const labels = {
  in_transit: '在途待收',
  due_today: '今日应到',
  overdue: '到仓逾期',
} satisfies Record<Memo['status'], string>;

export function ArrivalMemos({ memos, today }: {
  readonly memos: readonly Memo[];
  readonly today?: { readonly focusBatch: string | null };
}) {
  if (memos.length === 0) return null;
  return (
    <SectionGroup title={today === undefined ? '到仓备忘录' : '待收批次'} meta={`${memos.length} 批`}>
      {memos.map((memo) => <ArrivalMemoRow key={memo.batchId} memo={memo} hasTodayReturn={today !== undefined} isFocused={today?.focusBatch === memo.batchId} />)}
    </SectionGroup>
  );
}

function ArrivalMemoRow({ memo, hasTodayReturn, isFocused }: { readonly memo: Memo; readonly hasTodayReturn: boolean; readonly isFocused: boolean }) {
  const batch = `批次 ${memo.batchSeq ?? memo.batchId}`;
  const query = new URLSearchParams({ focusBatch: memo.batchId });
  if (hasTodayReturn) query.set('backToToday', 'arrivals');
  const href = `/lines/${encodeURIComponent(memo.line.id)}?${query}`;
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => { if (isFocused) link.current?.focus(); }, [isFocused]);
  return (
    <SectionRow action={<Link ref={link} to={href} aria-label={`查看${batch} ${memo.line.poRaw ?? ''} ${memo.line.nameRaw ?? ''}`}>查看批次</Link>}>
      <div>{memo.line.poRaw ?? '—'} · {memo.line.nameRaw ?? '—'} · {batch} · {memo.warehouse ?? '收货方未命名'}</div>
      <div style={{ color: memo.status === 'overdue' ? statusColor.danger.text : text.secondary }}>
        {labels[memo.status]} · 待收 {quantity(memo.inTransitQty, memo.unit)} · 实收 {quantity(memo.receivedQty, memo.unit)} · {memo.confirmedDate ?? '确认日未定'}
      </div>
    </SectionRow>
  );
}

function quantity(value: number, unit: string): string {
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 4 })} ${unit}`;
}
