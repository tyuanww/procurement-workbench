import { useEffect, useRef } from 'react';
import { Button, Card, Flex, Typography } from 'antd';
import type { TodayResponse } from '@sw/contracts';
import { TodayOrderLink, type BoardRow, type PlanRow } from '../../features/today/index.js';
import { border, fontSize, space, statusColor } from '../../theme/tokens.js';

type Arrival = TodayResponse['arrivalMemos'][number];

export function arrivalWork(memos: readonly Arrival[], rows: readonly BoardRow[]) {
  const actions = new Map(rows.map((row) => [row.id, row]));
  const byActionId = new Map<string, { readonly memo: Arrival; readonly showsQuantity: boolean; readonly showsDate: boolean }>();
  const separate: Arrival[] = [];
  for (const memo of memos) {
    if (memo.status === 'in_transit') continue;
    const id = 'batch:' + memo.batchId;
    const action = actions.get(id);
    if (action !== undefined) byActionId.set(id, { memo, showsQuantity: action.face.inTransit === undefined, showsDate: action.face.date !== memo.confirmedDate });
    else separate.push(memo);
  }
  return { byActionId, separate };
}

const AGENDA_LIMIT = 3;
const titleStyle = { margin: 0, fontSize: fontSize.section };

export function TodayAgenda({ arrivals, tasks, focusArrivalId, onOpen }: {
  readonly arrivals: readonly Arrival[];
  readonly tasks: readonly PlanRow[];
  readonly focusArrivalId: string | null;
  readonly onOpen: (id: string) => void;
}) {
  return <Flex vertical gap={space[2]}>
    {arrivals.length === 0 ? null : <Card size="small" title={<Typography.Title level={2} style={titleStyle}>到仓待核对</Typography.Title>}>
      <Flex vertical gap={space[1]}>
        {arrivals.slice(0, AGENDA_LIMIT).map((memo) => <ReceiptTask key={memo.batchId} memo={memo} isFocused={focusArrivalId === memo.batchId} isStandalone />)}
      </Flex>
    </Card>}
    {tasks.length === 0 ? null : <Card size="small" title={<Typography.Title level={2} style={titleStyle}>我的到期任务</Typography.Title>}>
      <Flex vertical gap={space[1]}>
        {tasks.slice(0, AGENDA_LIMIT).map((task) => <PlanTask key={task.id} task={task} onOpen={onOpen} />)}
      </Flex>
    </Card>}
  </Flex>;
}

export function planTaskCards(tasks: readonly PlanRow[], onOpen: (id: string) => void) {
  return tasks.map((task) => <li key={task.id}>
    <article><Card className="today-row" size="small"><PlanTask task={task} onOpen={onOpen} isCard /></Card></article>
  </li>);
}

function PlanTask({ task, onOpen, isCard }: {
  readonly task: PlanRow;
  readonly onOpen: (id: string) => void;
  readonly isCard?: boolean;
}) {
  return <Flex className="today-touch" vertical align="start" style={isCard ? undefined : { paddingBlock: space[1], borderBottom: '1px solid ' + border, overflowWrap: 'anywhere' }}>
    {isCard ? <Typography.Text type="secondary">排期任务</Typography.Text> : null}
    <Button type="link" onClick={() => onOpen(task.id)} style={{ padding: 0, height: 'auto', maxWidth: '100%', whiteSpace: 'normal', textAlign: 'start' }}>
      {task.title}
    </Button>
    <Typography.Text type="secondary">{task.meta}</Typography.Text>
    <span>{task.tags.filter(({ key }) => key === 'due' || key === 'status').map(({ label }) => label).join(' · ')}</span>
  </Flex>;
}

export function ReceiptTask({ memo, isFocused, isStandalone, showsQuantity, showsDate }: {
  readonly memo: Arrival;
  readonly isFocused: boolean;
  readonly isStandalone?: boolean;
  readonly showsQuantity?: boolean;
  readonly showsDate?: boolean;
}) {
  const link = useRef<HTMLAnchorElement>(null);
  useEffect(() => { if (isFocused) link.current?.focus(); }, [isFocused]);
  const isLate = memo.status === 'overdue';
  const state = isLate ? '到仓逾期' : '今日应到';
  const label = [memo.line.poRaw, memo.line.nameRaw, memo.batchSeq == null ? null : '第 ' + memo.batchSeq + ' 批'].filter(Boolean).join(' · ');
  const facts = receiptFacts({ memo, showsDate: isStandalone === true || showsDate === true, showsQuantity: isStandalone === true || showsQuantity === true });
  return <div className="today-receipt-task" style={{ overflowWrap: 'anywhere', paddingBlockStart: isStandalone === true ? 0 : space[1] }}>
    {isStandalone === true ? <Typography.Text strong>{label || '待收批次'}</Typography.Text> : null}
    <Flex align="baseline" gap={space[1]} wrap>
      <Typography.Text style={{ color: (isLate ? statusColor.danger : statusColor.warning).text }}>{state}</Typography.Text>
      <Typography.Text type="secondary">{facts.filter(Boolean).join(' · ')}</Typography.Text>
      <TodayOrderLink order={{ lineId: memo.line.id, batchId: memo.batchId }} arrivalFocusId={memo.batchId} focusRef={link}
        ariaLabel={label === '' ? undefined : `核对收货 ${label}`}>核对收货
      </TodayOrderLink>
    </Flex>
  </div>;
}

function receiptFacts({ memo, showsDate, showsQuantity }: { readonly memo: Arrival; readonly showsDate: boolean; readonly showsQuantity: boolean }) {
  const quantity = showsQuantity ? '待收 ' + memo.inTransitQty.toLocaleString('zh-CN', { maximumFractionDigits: 4 }) + ' ' + memo.unit : null;
  return [memo.warehouse ?? '收货方未命名', showsDate ? memo.confirmedDate : null, quantity];
}
