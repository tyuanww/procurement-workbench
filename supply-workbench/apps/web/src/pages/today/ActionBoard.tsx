import { Alert, Button, Collapse, Empty, Flex, Spin, Tag, Typography } from 'antd';
import type { ReactNode } from 'react';
import { CopyOutlined } from '@ant-design/icons';
import type { BoardGroup, BoardRow, GroupMode, QuickAction, ReasonChip, TodayBoard, TodayInsight, TodayKpiItem } from '../../features/today/index.js';
import { todayPageKpi } from '../../features/today/index.js';
import { MetricStrip, type MetricItem, type MetricTone } from '../../shared/ui/analytics.js';
import { useCanWrite } from '../../shared/actor.js';
import { actionIcon, FaceBlock } from './TodayDrawer.js';
import { ActionControls, ActionPagination, ActionResult, ChaseControls, type ActionPageControls } from './ActionControls.js';
import { TodayGroup, TodayGrouping } from './TodayGroup.js';
import { rowStyle } from './today-style.js';

const ACTION_MODES: readonly { readonly id: GroupMode; readonly label: string }[] = [
  { id: 'waiting', label: '等待方' },
  { id: 'reason', label: '原因' },
  { id: 'date', label: '日期' },
];

type BatchSequence = (rowId: string) => number | undefined;

export type ActionBoardProps = {
  readonly board: TodayBoard;
  readonly page: ActionPageControls | undefined;
  readonly hasOtherWork: boolean;
  readonly batchSeqOf?: BatchSequence | undefined;
  readonly insight: TodayInsight;
  readonly focus: string | null;
  readonly fading: string | null;
  readonly onToggleReason: (code: string) => void;
  readonly onGroup: (group: GroupMode) => void;
  readonly onOpen: (id: string) => void;
  readonly onQuick: (input: { readonly id: string; readonly kind: QuickAction['kind'] }) => void;
  readonly onCopy: (text: string) => void;
};

export function ActionBoard(props: ActionBoardProps): ReactNode {
  const { board, page } = props;
  return (
    <section id="today-chase" className="today-jump-target" tabIndex={-1} aria-label="行动板待办">
      <Flex vertical gap="small">
        <Typography.Title level={2} style={{ margin: 0 }}>要催货</Typography.Title>
        <Flex className="today-touch" align="center" gap="small" wrap>
          {page?.sort.kind === 'bulk' ? null : <TodayGrouping label="行动板分组" modes={ACTION_MODES} group={board.group} onGroup={props.onGroup} />}
          {page === undefined ? null : <ActionControls page={page} />}
        </Flex>
        <ActionOptions {...props} />
        {page === undefined ? <ActionGroups {...props} /> : <PagedGroups {...props} page={page} />}
      </Flex>
    </section>
  );
}

function ActionOptions({ board, insight, page, onToggleReason }: ActionBoardProps) {
  const selected = board.chips.filter((chip) => chip.isSelected);
  const label = page === undefined ? '筛选与指标' : '筛选、指标与复制催单';
  return <Collapse size="small" items={[{
    key: 'options',
    label: selected.length === 0 ? label : `${label}（${selected.map((chip) => chip.label).join('、')}）`,
    children: <Flex vertical gap="small">
      <search className="today-touch" aria-label="行动板筛选">
        <ReasonChips chips={board.chips} onToggle={onToggleReason} />
      </search>
      <ActionMetrics insight={insight} />
      {page === undefined ? null : <ChaseControls page={page} />}
    </Flex>,
  }]} />;
}

function PagedGroups(props: ActionBoardProps & { readonly page: ActionPageControls }) {
  const { page } = props;
  return <>
    <ActionResult page={page} />
    {page.copyNotice === '' ? null : <Typography.Text role="status">{page.copyNotice}</Typography.Text>}
    {page.loadError === '' ? null : <Alert type="error" title={page.loadError} action={<Button size="small" onClick={page.onRetry}>重试</Button>} />}
    <Spin spinning={page.isLoading}>
      <div aria-busy={page.isLoading} inert={!page.isSettled}>
        <ActionGroups {...props} />
      </div>
    </Spin>
    <ActionPagination page={page} />
  </>;
}

function ActionMetrics({ insight }: { readonly insight: TodayInsight }): ReactNode {
  const items = todayPageKpi(insight);
  return <>
    <div className="today-metric-cards"><MetricStrip ariaLabel="今日关键指标" items={items.map(kpiItem)} /></div>
    <div className="today-metric-summary" role="group" aria-label="今日关键指标">
      {items.map(({ key, label, value }) => <Typography.Text key={key} type="secondary">{label} {value}</Typography.Text>)}
    </div>
  </>;
}

function kpiItem(item: TodayKpiItem): MetricItem {
  return { ...item, tone: kpiTone(item.key) };
}

function kpiTone(key: TodayKpiItem['key']): MetricTone {
  if (key === 'urgent') return 'danger';
  if (key === 'overdue') return 'warning';
  if (key === 'missing') return 'attention';
  return 'neutral';
}

function ReasonChips(props: { readonly chips: readonly ReasonChip[]; readonly onToggle: (code: string) => void }): ReactNode {
  return (
    <Flex align="center" gap="small" wrap>
      {props.chips.map((chip) => (
        <Tag.CheckableTag key={chip.code} checked={chip.isSelected} onChange={() => props.onToggle(chip.code)}>{chip.label} {chip.count}</Tag.CheckableTag>
      ))}
    </Flex>
  );
}

function ActionGroups(props: ActionBoardProps): ReactNode {
  if (props.board.body.kind === 'empty') {
    if (props.page?.sort.kind === 'bulk' || props.board.chips.some((chip) => chip.isSelected)) return <Empty description="当前筛选没有待办" />;
    if (props.hasOtherWork) return null;
    return <Empty description={props.board.body.text}><Button href="/lines">去跟进中心</Button></Empty>;
  }
  return (
    <>
      {props.board.body.groups.map((group) => (
        <GroupBlock key={group.key} group={group} focus={props.focus} fading={props.fading} onOpen={props.onOpen} onQuick={props.onQuick}
          page={props.page} batchSeqOf={props.batchSeqOf} copy={groupCopy({ group, page: props.page, onCopy: props.onCopy })} />
      ))}
    </>
  );
}

type CopyAction = { readonly label: string; readonly disabled: boolean; readonly run: () => void };

function groupCopy({ group, page, onCopy }: { readonly group: BoardGroup; readonly page: ActionBoardProps['page']; readonly onCopy: ActionBoardProps['onCopy'] }): CopyAction | null {
  if (page === undefined) {
    if (group.nudgeText === '') return null;
    return { label: '复制催办文本', disabled: false, run: () => onCopy(group.nudgeText) };
  }
  const factory = page.paging.factories.find((item) => group.key === `supplier:${item.id}`);
  if (factory === undefined) return null;
  return {
    label: `复制${factory.name}催单（${page.isFiltered ? '筛选结果' : '全部页'}）`, disabled: page.isCopying,
    run: () => page.onCopyChase({ kind: 'factory', id: factory.id }),
  };
}

function batchCopy(page: ActionBoardProps['page'], id: string): CopyAction | null {
  if (page?.paging.chaseItemIds?.includes(id) !== true) return null;
  return { label: '复制本批催单', disabled: page.isCopying, run: () => page.onCopyChase({ kind: 'batch', id }) };
}

function GroupBlock(props: {
  readonly group: BoardGroup;
  readonly focus: string | null;
  readonly fading: string | null;
  readonly onOpen: (id: string) => void;
  readonly onQuick: (input: { readonly id: string; readonly kind: QuickAction['kind'] }) => void;
  readonly copy: CopyAction | null;
  readonly page: ActionBoardProps['page'];
  readonly batchSeqOf?: BatchSequence | undefined;
}): ReactNode {
  return (
    <TodayGroup name={props.group.name} counts={props.group.counts} action={props.copy === null ? null :
      <Button size="small" icon={<CopyOutlined aria-hidden />} disabled={props.copy.disabled} onClick={props.copy.run}>{props.copy.label}</Button>}>
      <ActionRows group={props.group} focus={props.focus} fading={props.fading} onOpen={props.onOpen} onQuick={props.onQuick}
        page={props.page} batchSeqOf={props.batchSeqOf} />
    </TodayGroup>
  );
}

function ActionRows(props: {
  readonly group: BoardGroup;
  readonly focus: string | null;
  readonly fading: string | null;
  readonly page: ActionBoardProps['page'];
  readonly batchSeqOf?: BatchSequence | undefined;
  readonly onOpen: (id: string) => void;
  readonly onQuick: (input: { readonly id: string; readonly kind: QuickAction['kind'] }) => void;
}): ReactNode {
  return (
    <div>
      {props.group.rows.map((row) => (
        <TodayRow key={`${props.group.key}:${row.id}`} row={row} isFocused={props.focus === row.id} isFading={props.fading === row.id}
          batchSeq={props.batchSeqOf?.(row.id)} copy={batchCopy(props.page, row.id)} onOpen={() => props.onOpen(row.id)}
          onQuick={(kind) => props.onQuick({ id: row.id, kind })} />
      ))}
    </div>
  );
}

function TodayRow(props: {
  readonly row: BoardRow;
  readonly isFocused: boolean;
  readonly isFading: boolean;
  readonly batchSeq: number | undefined;
  readonly copy: CopyAction | null;
  readonly onOpen: () => void;
  readonly onQuick: (kind: QuickAction['kind']) => void;
}): ReactNode {
  const { orderNo, productName } = props.row.face;
  const batch = props.batchSeq === undefined ? '' : ` · 第 ${props.batchSeq} 批`;
  return (
    <Flex className="today-row" vertical gap="small" style={rowStyle({ isFocused: props.isFocused, isFading: props.isFading })}>
      <FaceBlock face={props.row.face} batchSeq={props.batchSeq} />
      <Flex className="today-touch" align="center" gap="small" wrap>
        <Button size="small" onClick={props.onOpen} aria-label={`查看详情 ${orderNo} · ${productName}${batch}`}>查看详情</Button>
        <RowActions actions={props.row.actions} onQuick={props.onQuick} />
        {props.copy === null ? null : <Button type="text" size="small" icon={<CopyOutlined aria-hidden />} disabled={props.copy.disabled} onClick={props.copy.run}>{props.copy.label}</Button>}
      </Flex>
    </Flex>
  );
}

function RowActions(props: { readonly actions: readonly QuickAction[]; readonly onQuick: (kind: QuickAction['kind']) => void }): ReactNode {
  const canRecord = useCanWrite('records.write');
  if (!canRecord) return null;
  return (
    <>
      {props.actions.map((action, index) => (
        <Button key={action.kind} type={index === 0 ? 'default' : 'text'} size="small" icon={actionIcon(action.kind)} onClick={() => props.onQuick(action.kind)}>{action.label}</Button>
      ))}
    </>
  );
}

