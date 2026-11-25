import { Alert, Button, Calendar, Card, DatePicker, Flex, Statistic, Tag, Typography } from 'antd';
import { CheckOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { PersonalTodayResponse, PersonalTodayScope, TodoItemView } from '@sw/contracts';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useId, type CSSProperties } from 'react';
import { formatDateTime } from '../../shared/ui/format.js';
import { bg, border, brand, fontSize, radiusCard, space, statusColor, text } from '../../theme/tokens.js';
import { toBoardItem } from '../today/card.js';
import type { WorkspaceView } from './personal-query.js';

const scopeLabel = { pending: '待跟进', scheduled: '已约跟进' };
const SCOPES = ['pending', 'scheduled'] as const;

export function WorkspaceCounts({ counts, scope, onScope }: {
  readonly counts: PersonalTodayResponse['counts'] | undefined;
  readonly scope: PersonalTodayScope;
  readonly onScope: (scope: PersonalTodayScope) => void;
}) {
  return <div className="procurement-workspace-metrics" role="group" aria-label="逾期未发跟进筛选">
    {SCOPES.map((key) => <WorkspaceCount key={key} title={scopeLabel[key]} count={counts?.[key]}
      active={scope === key} onSelect={() => onScope(scope === key ? 'all' : key)} />)}
  </div>;
}

function WorkspaceCount({ title, count, active, onSelect }: {
  readonly title: string;
  readonly count: number | undefined;
  readonly active: boolean;
  readonly onSelect: () => void;
}) {
  const id = useId();
  return <Card size="small" className="procurement-workspace-metric" data-active={active}>
    <Button type="text" aria-labelledby={id} aria-pressed={active} className="procurement-workspace-metric-button" onClick={onSelect} />
    <div id={id}>
      <Statistic title={<>{title}{active ? <> <CheckOutlined aria-hidden="true" /></> : null}</>}
        value={count ?? '—'} suffix={count === undefined ? null : <span style={{ fontSize: fontSize.meta }}>批</span>} />
    </div>
  </Card>;
}

type BatchesProps = {
  readonly items: readonly TodoItemView[];
  readonly focus: string | null;
  readonly onOpen: (id: string) => void;
};

export function WorkspaceBatches({ items, scope, view, focus, onOpen }: BatchesProps & {
  readonly scope: PersonalTodayScope;
  readonly view: WorkspaceView;
}) {
  if (items.length === 0) return <Alert type="info" title={view === 'calendar' ? '这一天没有符合条件的本人逾期未发批次'
    : `暂无${scope === 'all' ? '' : scopeLabel[scope] + '的'}本人逾期未发批次`} />;
  if (view !== 'board') return <BatchList items={items} focus={focus} onOpen={onOpen} />;
  const lanes = scope === 'all' ? SCOPES : [scope];
  return <div className="procurement-workspace-board" data-single-lane={lanes.length === 1}>
    {lanes.map((key) => {
      const matches = items.filter((item) => workspaceScopeOf(item) === key);
      return <section key={key} className="procurement-workspace-lane">
        <Typography.Title level={2} style={{ marginBlock: `0 ${space[1]}px` }}>{scopeLabel[key]}</Typography.Title>
        {matches.length === 0 ? <Typography.Text type="secondary">本页无匹配批次</Typography.Text>
          : <BatchList items={matches} focus={focus} onOpen={onOpen} />}
      </section>;
    })}
  </div>;
}

export function workspaceScopeOf(item: TodoItemView): Exclude<PersonalTodayScope, 'all'> {
  return item.reasons.includes('follow_up_scheduled') ? 'scheduled' : 'pending';
}

function BatchList({ items, focus, onOpen }: BatchesProps) {
  return <ul role="list" className="procurement-workspace-batches">
    {items.map((item) => <li key={item.id}><WorkspaceBatch item={item} focused={focus === item.id} onOpen={onOpen} /></li>)}
  </ul>;
}

function WorkspaceBatch({ item, focused, onOpen }: { readonly item: TodoItemView; readonly focused: boolean; readonly onOpen: (id: string) => void }) {
  const board = toBoardItem(item);
  const batchName = item.batch === null ? '' : `第 ${item.batch.seq} 批`;
  const reference = [board.poRaw, batchName].filter(Boolean).join(' · ');
  return <Card size="small" className="procurement-workspace-batch" data-focused={focused}>
    <Flex vertical gap={space[0]}>
      <Flex align="center" gap={space[1]} wrap>
        <Button type="link" id={`workspace-batch-${item.id}`} className="procurement-workspace-batch-link" onClick={() => onOpen(item.id)}>
          {board.productName ?? '要货批次'}{reference === '' ? '' : ` · ${reference}`}
        </Button>
        <Tag style={overdueStyle}><ClockCircleOutlined aria-hidden /> 逾期 {item.overdueDays} 天</Tag>
      </Flex>
      <BatchAmounts facts={item.batch?.fulfillment} />
      <Typography.Text type="secondary">{item.dueDate === null ? null : <>采购确认到仓日 <time dateTime={item.dueDate}>{item.dueDate}</time> · </>}
        {board.waitingName}</Typography.Text>
      <BatchFollowUp batch={item.batch} />
    </Flex>
  </Card>;
}

function BatchAmounts({ facts }: { readonly facts: NonNullable<TodoItemView['batch']>['fulfillment'] }) {
  return <Flex align="center" gap={space[1]} wrap>
    <Typography.Text strong>未发 {amount(facts?.unshippedQty, facts?.unit)}</Typography.Text>
    {facts?.inTransitQty == null ? null : <Typography.Text>在途待收 {amount(facts.inTransitQty, facts.unit)}</Typography.Text>}
    {facts?.receivedQty == null ? null : <Typography.Text>实收 {amount(facts.receivedQty, facts.unit)}</Typography.Text>}
  </Flex>;
}

function BatchFollowUp({ batch }: { readonly batch: TodoItemView['batch'] }) {
  const followUp = batch?.latestFollowUp;
  const nextFollowUpAt = batch?.nextFollowUpAt;
  return <>
    {followUp === undefined ? null : <Typography.Text className="procurement-workspace-note">最近跟进 · {followUp.text}
      {' '}<Typography.Text type="secondary"><time dateTime={followUp.createdAt}>{formatDateTime(followUp.createdAt)}</time></Typography.Text>
    </Typography.Text>}
    {nextFollowUpAt === undefined ? null : <Typography.Text className="procurement-workspace-note">
      下次跟进 · <time dateTime={nextFollowUpAt}>{formatDateTime(nextFollowUpAt)}</time>
    </Typography.Text>}
  </>;
}

const quantity = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });
const overdueStyle: CSSProperties = { color: statusColor.danger.text, background: statusColor.danger.bg, borderColor: statusColor.danger.border };

function amount(qty: number | null | undefined, unit: string | null | undefined): string {
  return qty == null ? '待核实' : `${quantity.format(qty)} ${unit ?? ''}`.trim();
}

export function WorkspaceCalendar({ calendar, onDay }: {
  readonly calendar: NonNullable<PersonalTodayResponse['calendar']>;
  readonly onDay: (date: string) => void;
}) {
  const day = dayjs(calendar.date).locale('zh-cn');
  const counts = new Map<string, number>(calendar.days.map(({ date, count }) => [date, count]));
  return <Card size="small">
    <Flex vertical gap={space[1]}>
      <DatePicker aria-label="选择跟进日期" value={day} allowClear={false} style={{ alignSelf: 'flex-start' }}
        onChange={(selected) => { if (selected !== null) onDay(selected.format('YYYY-MM-DD')); }} />
      <Calendar value={day} fullscreen={false} onChange={(selected) => onDay(selected.format('YYYY-MM-DD'))}
        cellRender={(date, info) => {
          const count = info.type === 'date' ? counts.get(date.format('YYYY-MM-DD')) : undefined;
          return count === undefined ? null : <span className="procurement-workspace-calendar-count">{count} 批</span>;
        }} />
    </Flex>
  </Card>;
}

export const procurementWorkspaceStyles = `
  .procurement-workspace-metrics, .procurement-workspace-board { display: grid; gap: ${space[2]}px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .procurement-workspace-board[data-single-lane=true] { grid-template-columns: minmax(0, 1fr); }
  .procurement-workspace-metric { position: relative; }
  .procurement-workspace-metric[data-active=true] { background: ${brand[100]}; border-color: ${brand[600]}; }
  .procurement-workspace-metric .procurement-workspace-metric-button { position: absolute; inset: 0; inline-size: 100%; block-size: 100%; }
  .procurement-workspace-metric .procurement-workspace-metric-button:hover { background: transparent; box-shadow: inset 0 0 0 1px ${brand[600]}; }
  .procurement-workspace-metric .procurement-workspace-metric-button:focus-visible { outline: 2px solid ${brand[800]}; outline-offset: 2px; }
  .procurement-workspace-batches { display: grid; gap: ${space[1]}px; list-style: none; padding: 0; margin: 0; }
  .procurement-workspace-lane { min-inline-size: 0; padding: ${space[2]}px; background: ${bg.page}; border: 1px solid ${border}; border-radius: ${radiusCard}px; }
  .procurement-workspace-batch[data-focused=true] { border-color: ${brand[600]}; }
  .procurement-workspace-batch-link.ant-btn { display: inline-block; min-inline-size: 0; max-inline-size: 100%; block-size: auto; padding: 0; text-align: start; white-space: normal; overflow-wrap: anywhere; font-weight: 600; }
  .procurement-workspace-note { overflow-wrap: anywhere; }
  .procurement-workspace-calendar-count { display: block; color: ${text.secondary}; white-space: nowrap; font-size: ${fontSize.meta}px; }
  @media (width < 44rem) { .procurement-workspace-board { grid-template-columns: minmax(0, 1fr); } }
`;
