import { Button } from 'antd';
import { Link } from 'react-router';
import { useEffect, useRef } from 'react';
import type { TodayResponse } from '@sw/contracts';
import { SectionGroup, SectionRow } from '../../shared/ui/section.js';
import { statusColor, text } from '../../theme/tokens.js';

type Memo = TodayResponse['arrivalMemos'][number];

export const arrivalStatusLabel = {
  in_transit: '在途待收',
  due_today: '今日应到',
  overdue: '到仓逾期',
} satisfies Record<Memo['status'], string>;

export const arrivalMemoButtonId = (batchId: string) => `today-arrival:${batchId}`;

type TodayArrivals = {
  readonly focusBatch: string | null;
  readonly title?: string;
  readonly onOpen: (batchId: string) => void;
};

export function ArrivalMemos({ memos, today }: {
  readonly memos: readonly Memo[];
  readonly today?: TodayArrivals;
}) {
  if (memos.length === 0) return null;
  return (
    <SectionGroup title={today === undefined ? '到仓备忘录' : (today.title ?? '待收批次')} meta={`${memos.length} 批`}>
      {memos.map((memo) => <ArrivalMemoRow key={memo.batchId} memo={memo} today={today} />)}
    </SectionGroup>
  );
}

function ArrivalMemoRow({ memo, today }: { readonly memo: Memo; readonly today: TodayArrivals | undefined }) {
  const batch = `批次 ${memo.batchSeq ?? memo.batchId}`;
  const query = new URLSearchParams({ focusBatch: memo.batchId });
  const href = `/lines/${encodeURIComponent(memo.line.id)}?${query}`;
  const identity = `${memo.line.poRaw ?? '—'} · ${memo.line.nameRaw ?? '—'} · ${batch}`;
  const button = useRef<HTMLButtonElement>(null);
  const isFocused = today?.focusBatch === memo.batchId;
  useEffect(() => { if (isFocused) button.current?.focus(); }, [isFocused]);
  return (
    <div className="today-arrival-row" data-current={isFocused || undefined}><SectionRow action={today === undefined
      ? <Link to={href} aria-label={`查看批次 ${identity}`}>查看批次</Link>
      : <span className="today-touch"><Button type="link" ref={button} id={arrivalMemoButtonId(memo.batchId)} aria-label={`查看批次 ${identity}`}
        onClick={() => today.onOpen(memo.batchId)}>查看批次</Button></span>}>
      <div>{identity} · {memo.warehouse ?? '收货方未命名'}</div>
      <div style={{ color: memo.status === 'overdue' ? statusColor.danger.text : text.secondary }}>
        {arrivalStatusLabel[memo.status]} · 待收 {quantity(memo.inTransitQty, memo.unit)} · 实收 {quantity(memo.receivedQty, memo.unit)} · {memo.confirmedDate ?? '确认日未定'}
      </div>
    </SectionRow></div>
  );
}

function quantity(value: number, unit: string): string {
  return `${value.toLocaleString('zh-CN', { maximumFractionDigits: 4 })} ${unit}`;
}
