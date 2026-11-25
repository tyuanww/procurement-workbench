import { useEffect, useRef } from 'react';
import { Button, Card, Flex, Typography } from 'antd';
import type { TodayResponse } from '@sw/contracts';
import { rowStyle, TodayOrderLink, type BoardRow, type PlanRow } from '../../features/today/index.js';
import { space, statusColor } from '../../theme/tokens.js';

export const PLAN_TASK_TARGET = 'today-plan-tasks';

type Arrival = TodayResponse['arrivalMemos'][number];

export type ReceiptWork = { readonly memo: Arrival; readonly showsQuantity: boolean; readonly showsDate: boolean };

export function arrivalWork(memos: readonly Arrival[], rows: readonly BoardRow[]) {
  const byBatch = new Map(memos.filter((memo) => memo.status !== 'in_transit').map((memo) => ['batch:' + memo.batchId, memo]));
  const byActionId = new Map<string, ReceiptWork>();
  for (const row of rows) {
    const memo = byBatch.get(row.id);
    if (memo === undefined) continue;
    byActionId.set(row.id, { memo, showsQuantity: row.face.inTransit === undefined, showsDate: row.face.date !== memo.confirmedDate });
  }
  return byActionId;
}

export function planTaskCards({ tasks, focus, onOpen }: {
  readonly tasks: readonly PlanRow[];
  readonly focus: string | null;
  readonly onOpen: (id: string) => void;
}) {
  return tasks.map((task, index) => <li key={task.id} {...(index === 0 ? { id: PLAN_TASK_TARGET, className: 'today-jump-target', tabIndex: -1 } : {})}>
    <article><Card className="today-row" size="small" style={rowStyle({ isFocused: focus === task.id, isFading: false })}>
      <Flex className="today-touch" vertical align="start" gap={space[0]}>
        <Typography.Text type="secondary">排期任务</Typography.Text>
        <Button type="link" onClick={() => onOpen(task.id)} style={{ padding: 0, height: 'auto', maxWidth: '100%', whiteSpace: 'normal', textAlign: 'start' }}>
          {task.title}
        </Button>
        <Typography.Text type="secondary">{task.meta}</Typography.Text>
        <span>{task.tags.filter(({ key }) => key === 'due' || key === 'status').map(({ label }) => label).join(' · ')}</span>
      </Flex>
    </Card></article>
  </li>);
}

export function ReceiptFacts({ memo, showsQuantity, showsDate }: ReceiptWork) {
  const isLate = memo.status === 'overdue';
  const state = isLate ? '到仓逾期' : '今日应到';
  const quantity = showsQuantity ? '待收 ' + memo.inTransitQty.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) + ' ' + memo.unit : null;
  const facts = [memo.warehouse ?? '收货方未命名', showsDate ? memo.confirmedDate : null, quantity].filter(Boolean).join(' · ');
  return <Flex align="baseline" gap={space[1]} wrap>
    <Typography.Text style={{ color: (isLate ? statusColor.danger : statusColor.warning).text }}>{state}</Typography.Text>
    <Typography.Text type="secondary">{facts}</Typography.Text>
  </Flex>;
}

export function ReceiptAction({ memo, isFocused }: { readonly memo: Arrival; readonly isFocused: boolean }) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => { if (isFocused) link.current?.focus(); }, [isFocused]);
  const label = [memo.line.poRaw, memo.line.nameRaw, memo.batchSeq == null ? null : '第 ' + memo.batchSeq + ' 批'].filter(Boolean).join(' · ');
  return <TodayOrderLink order={{ lineId: memo.line.id, batchId: memo.batchId }} arrivalFocusId={memo.batchId} focusRef={link}
    primary ariaLabel={label === '' ? undefined : `核对收货 ${label}`}>核对收货
  </TodayOrderLink>;
}
