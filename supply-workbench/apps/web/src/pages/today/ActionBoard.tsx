import { Button, Empty, Tag, Spin, Alert, Typography } from 'antd';
import type { ReactNode } from 'react';
import { CopyOutlined } from '@ant-design/icons';
import type { BoardGroup, BoardRow, GroupMode, QuickAction, ReasonChip, ReasonCount, TodayBoard, TodayInsight, TodayKpiItem } from '../../features/today/index.js';
import { todayPageKpi } from '../../features/today/index.js';
import { MetricStrip, type MetricItem, type MetricTone } from '../../shared/ui/analytics.js';
import { useCanWrite } from '../../shared/actor.js';
import { actionIcon, FaceBlock } from './TodayDrawer.js';
import { ActionControls, ActionPagination, ChaseControls, type ActionPageControls } from './ActionControls.js';
import { GroupChips } from './group-chips.js';
import { chipRowStyle, countStyle, groupStyle, headStyle, rowStyle, titleStyle } from './today-style.js';

const ACTION_MODES: readonly { readonly id: GroupMode; readonly label: string }[] = [
  { id: 'waiting', label: '等待方' },
  { id: 'reason', label: '原因' },
  { id: 'date', label: '日期' },
];

export type ActionBoardProps = {
  readonly board: TodayBoard;
  readonly page: ActionPageControls | undefined;
  readonly hasPendingBatch: boolean;
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
  return (
    <>
      <Typography.Title level={2} style={{ margin: 0 }}>要催货</Typography.Title>
      {props.page === undefined ? null : <ChaseControls page={props.page} />}
      <ActionMetrics insight={props.insight} />
      <search className="today-touch" aria-label="行动板筛选">
        {props.page?.sort.kind === 'bulk' ? null : <GroupChips modes={ACTION_MODES} group={props.board.group} onGroup={props.onGroup} />}
        <ReasonChips chips={props.board.chips} onToggle={props.onToggleReason} />
      </search>
      {props.page === undefined ? null : (
        <>
          <ActionControls page={props.page} />
          <ActionPagination page={props.page} />
          {props.page.loadError === '' ? null : <Alert type="error" title={props.page.loadError} action={<Button size="small" onClick={props.page.onRetry}>重试</Button>} />}
        </>
      )}
      <section id="today-chase" className="today-jump-target" tabIndex={-1} aria-label="行动板待办">
        {props.page === undefined ? <ActionGroups {...props} /> : (
          <Spin spinning={props.page.isLoading}>
            <div aria-busy={props.page.isLoading} inert={!props.page.isSettled}>
              <ActionGroups {...props} />
            </div>
          </Spin>
        )}
      </section>
    </>
  );
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
    <div style={chipRowStyle()}>
      {props.chips.map((chip) => (
        <Tag.CheckableTag key={chip.code} checked={chip.isSelected} onChange={() => props.onToggle(chip.code)}>{chip.label} {chip.count}</Tag.CheckableTag>
      ))}
    </div>
  );
}

function ActionGroups(props: ActionBoardProps): ReactNode {
  if (props.board.body.kind === 'empty') {
    if (props.page?.sort.kind === 'bulk' || props.board.chips.some((chip) => chip.isSelected)) return <Empty description="当前筛选没有待办" />;
    if (props.hasPendingBatch) return null;
    return <Empty description={props.board.body.text}><Button href="/lines">去跟进台</Button></Empty>;
  }
  return (
    <>
      {props.board.body.groups.map((group) => (
        <GroupBlock key={group.key} group={group} focus={props.focus} fading={props.fading} onOpen={props.onOpen} onQuick={props.onQuick}
          page={props.page} copy={groupCopy({ group, page: props.page, onCopy: props.onCopy })} />
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
}): ReactNode {
  return (
    <div style={groupStyle()}>
      <GroupHead name={props.group.name} counts={props.group.counts} copy={props.copy} />
      <ActionRows group={props.group} focus={props.focus} fading={props.fading} onOpen={props.onOpen} onQuick={props.onQuick} page={props.page} />
    </div>
  );
}

function ActionRows(props: {
  readonly group: BoardGroup;
  readonly focus: string | null;
  readonly fading: string | null;
  readonly page: ActionBoardProps['page'];
  readonly onOpen: (id: string) => void;
  readonly onQuick: (input: { readonly id: string; readonly kind: QuickAction['kind'] }) => void;
}): ReactNode {
  return (
    <div>
      {props.group.rows.map((row) => (
        <TodayRow key={`${props.group.key}:${row.id}`} row={row} isFocused={props.focus === row.id} isFading={props.fading === row.id}
          copy={batchCopy(props.page, row.id)} onOpen={() => props.onOpen(row.id)} onQuick={(kind) => props.onQuick({ id: row.id, kind })} />
      ))}
    </div>
  );
}

function GroupHead(props: { readonly name: string; readonly counts: readonly ReasonCount[]; readonly copy: CopyAction | null }): ReactNode {
  return (
    <div className="today-touch" style={headStyle()}>
      <span style={titleStyle()}>{props.name}</span>
      {props.counts.map((count) => <span key={count.label} style={countStyle()}>{count.label} {count.count}</span>)}
      {props.copy === null ? null : <Button icon={<CopyOutlined aria-hidden />} disabled={props.copy.disabled} onClick={props.copy.run}>{props.copy.label}</Button>}
    </div>
  );
}

function TodayRow(props: {
  readonly row: BoardRow;
  readonly isFocused: boolean;
  readonly isFading: boolean;
  readonly copy: CopyAction | null;
  readonly onOpen: () => void;
  readonly onQuick: (kind: QuickAction['kind']) => void;
}): ReactNode {
  return (
    <div className="today-row" style={rowStyle({ isFocused: props.isFocused, isFading: props.isFading })} onClick={props.onOpen}>
      <FaceBlock face={props.row.face} />
      <div className="today-touch" style={chipRowStyle()} onClick={(event) => event.stopPropagation()}>
        {props.copy === null ? null : <Button size="small" icon={<CopyOutlined aria-hidden />} disabled={props.copy.disabled} onClick={props.copy.run}>{props.copy.label}</Button>}
        <Button size="small" onClick={props.onOpen} aria-label={`查看详情 ${props.row.face.orderNo} · ${props.row.face.productName}`}>查看详情</Button>
        <RowActions actions={props.row.actions} onQuick={props.onQuick} />
      </div>
    </div>
  );
}

function RowActions(props: { readonly actions: readonly QuickAction[]; readonly onQuick: (kind: QuickAction['kind']) => void }): ReactNode {
  const canRecord = useCanWrite('records.write');
  if (!canRecord) return null;
  return (
    <>
      {props.actions.map((action) => (
        <Button key={action.kind} size="small" icon={actionIcon(action.kind)} onClick={() => props.onQuick(action.kind)}>{action.label}</Button>
      ))}
    </>
  );
}
