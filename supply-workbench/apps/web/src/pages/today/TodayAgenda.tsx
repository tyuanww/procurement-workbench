import { useEffect, useRef } from 'react';
import { Button, Card, Flex, Typography } from 'antd';
import type { TodayResponse } from '@sw/contracts';
import { rowStyle, TodayOrderLink, type BoardRow, type PlanRow } from '../../features/today/index.js';
import { space } from '../../theme/tokens.js';

export const PLAN_TASK_TARGET = 'today-plan-tasks';

export type ReceiptWork = TodayResponse['arrivalMemos'][number];

export function arrivalWork(memos: readonly ReceiptWork[], rows: readonly BoardRow[]) {
  const byBatch = new Map(memos.filter((memo) => memo.status !== 'in_transit').map((memo) => ['batch:' + memo.batchId, memo]));
  const byActionId = new Map<string, ReceiptWork>();
  for (const row of rows) {
    const memo = byBatch.get(row.id);
    if (memo === undefined) continue;
    byActionId.set(row.id, memo);
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

export function ReceiptAction({ memo, isFocused }: { readonly memo: ReceiptWork; readonly isFocused: boolean }) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => { if (isFocused) link.current?.focus(); }, [isFocused]);
  const label = [memo.line.poRaw, memo.line.nameRaw, memo.batchSeq == null ? null : '第 ' + memo.batchSeq + ' 批'].filter(Boolean).join(' · ');
  return <TodayOrderLink order={{ lineId: memo.line.id, batchId: memo.batchId }} arrivalFocusId={memo.batchId} focusRef={link}
    primary ariaLabel={label === '' ? undefined : `核对收货 ${label}`}>核对收货
  </TodayOrderLink>;
}
