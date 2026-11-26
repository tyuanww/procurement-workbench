import { RightOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Flex, Result, Skeleton, Typography } from 'antd';
import { useId, type CSSProperties, type ReactNode } from 'react';
import { Link, useInRouterContext, useLocation, useSearchParams } from 'react-router';
import type { GroupMode, PlanBoardGroup, PlanLoad, PlanRow } from '../../features/today/index.js';
import { border, brand, fontSize, rowComfort, space } from '../../theme/tokens.js';
import { TaskTagView } from '../../features/plan/index.js';
import { useCan } from '../../shared/actor.js';
import { TodayGrouping } from './TodayGroup.js';
import { ScheduleOverview, type ScheduleSelection } from './ScheduleOverview.js';
import { readScheduleFilter } from './schedule-filter.js';
import { workspaceRowId } from './today-focus.js';

const SCHEDULE_MODES: readonly { readonly id: GroupMode; readonly label: string }[] = [
  { id: 'schedule', label: '排期' },
  { id: 'owner', label: '负责人' },
  { id: 'supplier', label: '供应商' },
];

export type ScheduleViewProps = {
  readonly isMine?: boolean;
  readonly group: GroupMode;
  readonly load: PlanLoad;
  readonly focus: string | null;
  readonly onGroup: (group: GroupMode) => void;
  readonly onOpen: (id: string) => void;
  readonly onRetry: () => void;
};

export function ScheduleView(props: ScheduleViewProps): ReactNode {
  return useInRouterContext() ? <RoutedScheduleView {...props} /> : <ScheduleBody {...props} selection={{ filter: undefined }} />;
}

function RoutedScheduleView(props: ScheduleViewProps) {
  const [params, setParams] = useSearchParams();
  const selection: ScheduleSelection = { filter: readScheduleFilter(params), onFilter: (filter) => {
    const next = new URLSearchParams(params);
    if (filter === undefined) next.delete('planFilter');
    else next.set('planFilter', filter);
    next.delete('focusId');
    setParams(next);
  } };
  return <ScheduleBody {...props} selection={selection} />;
}

function ScheduleControls({ group, onGroup, isMine }: ScheduleViewProps) {
  return <Flex className="today-touch" wrap align="center" gap={space[1]}>
    <TodayGrouping label="今日排期分组" modes={SCHEDULE_MODES} group={group} onGroup={onGroup} />
    <PlanScope isMine={isMine === true} group={group} />
  </Flex>;
}

function PlanScope(props: { readonly isMine: boolean; readonly group: GroupMode }) {
  return useInRouterContext() ? <PlanScopeLink {...props} /> : null;
}

function PlanScopeLink({ isMine, group }: Parameters<typeof PlanScope>[0]) {
  const query = new URLSearchParams({ group });
  const current = new URLSearchParams(useLocation().search);
  const returnSearch = current.get('workspaceReturn');
  const filter = readScheduleFilter(current);
  if (filter !== undefined) query.set('planFilter', filter);
  if (!isMine) query.set('mine', '1');
  if (returnSearch) query.set('workspaceReturn', returnSearch);
  return <Link to={'?' + query}>{isMine ? '查看全部可见排期' : '只看我的到期排期'}</Link>;
}

function ScheduleBody(props: ScheduleViewProps & { readonly selection: ScheduleSelection }): ReactNode {
  const { load, selection } = props;
  if (load.kind === 'ready' && (load.board.kind === 'groups' || load.unfilteredRows !== undefined)) {
    const matched = load.board.kind === 'groups' ? load.board.rows : [];
    return <ScheduleOverview rows={matched} completeRows={load.unfilteredRows ?? matched} selection={selection} onOpen={props.onOpen}>
      <Card size="small" className="today-workspace-results today-schedule-list" title={<Flex align="center" justify="space-between" gap="small" wrap>
        <Typography.Title level={2}>{props.isMine === true ? '我的任务清单' : '可见任务清单'}</Typography.Title>
        <ScheduleControls {...props} />
      </Flex>} styles={{ header: { paddingBlock: space[1] }, title: { whiteSpace: 'normal' }, body: { paddingBlock: space[0] } }}>
        {load.board.kind === 'empty' ? <Empty description="当前筛选没有排期任务" />
          : load.board.groups.map((group) => <PlanGroupBlock key={group.key} group={group} focus={props.focus} onOpen={props.onOpen} />)}
      </Card>
    </ScheduleOverview>;
  }
  return <>
    <Flex className="today-touch" gap="small" align="center" wrap>
      <ScheduleControls {...props} />
      {selection.filter === undefined ? null : <Button type="link" onClick={() => selection.onFilter?.(undefined)}>清除排期筛选</Button>}
    </Flex>
    <ScheduleFallback {...props} />
  </>;
}

function ScheduleFallback(props: ScheduleViewProps): ReactNode {
  const canReadImports = useCan('imports.read');
  if (props.load.kind === 'idle' || props.load.kind === 'loading') return <Skeleton active paragraph={{ rows: 6 }} />;
  if (props.load.kind === 'error') return <Result status="error" title="排期没有读出来" subTitle={props.load.message} extra={<Button type="primary" onClick={props.onRetry}>重试</Button>} />;
  if (props.load.board.kind === 'empty') {
    return <Empty description={props.isMine === true ? '我没有到期的排期任务。' : props.load.board.text}>
      {canReadImports ? <Button href="/imports">去导入排期里程碑</Button> : null}
    </Empty>;
  }
  return null;
}

function PlanGroupBlock(props: { readonly group: PlanBoardGroup; readonly focus: string | null; readonly onOpen: (id: string) => void }): ReactNode {
  const { group, focus, onOpen } = props;
  const headingId = useId();
  const [, ...additionalCounts] = group.counts;
  return (
    <section style={{ paddingBlock: space[0] }}>
      <Flex component="header" align="center" gap={space[1]} wrap style={{ paddingBlock: space[1], overflowWrap: 'anywhere' }}>
        <Typography.Title id={headingId} level={3} style={{ margin: 0, fontSize: fontSize.section }}>{group.name}</Typography.Title>
        {group.key === 'due-today' || group.key === 'overdue' ? null : <Typography.Text type="secondary">{group.rows.length} 项</Typography.Text>}
        {additionalCounts.map(({ label, count }) => count > 0
          ? <Typography.Text key={label} type="secondary">{label} {count}</Typography.Text> : null)}
        {group.note === null || group.isUnassigned ? null : <Typography.Text type="secondary">{group.note}</Typography.Text>}
      </Flex>
      {group.isUnassigned && group.note !== null ? <Alert type="warning" title={group.note} showIcon /> : null}
      <ul role="list" aria-labelledby={headingId} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {group.rows.map((row) => <li key={row.id} style={{ borderBlockStart: `1px solid ${border}` }}>
          <PlanTaskRow row={row} showDue={group.key !== 'due-today'}
            isKeyboardFocused={focus === row.id} onOpen={() => onOpen(row.id)} />
        </li>)}
      </ul>
    </section>
  );
}

function PlanTaskRow(props: {
  readonly row: PlanRow;
  readonly showDue: boolean;
  readonly isKeyboardFocused: boolean;
  readonly onOpen: () => void;
}): ReactNode {
  const { title, meta, tags } = props.row;
  const titleId = useId();
  const contextId = useId();
  const stateId = useId();
  const isState = ({ key }: PlanRow['tags'][number]) => key === 'status' || key === 'due';
  const details = tags.filter((tag) => !isState(tag)).map(({ label }) => label).join(' · ');
  const states = tags.filter((tag) => isState(tag) && (props.showDue || tag.key !== 'due'));
  return (
    <Button id={workspaceRowId(props.row.id)} className="today-task-row today-jump-target" type="text" block style={rowStyle(props.isKeyboardFocused)}
      aria-labelledby={titleId} aria-describedby={states.length === 0 ? contextId : `${contextId} ${stateId}`}
      aria-haspopup="dialog" onClick={props.onOpen}>
      <Flex component="span" wrap align="center" gap={`${space[0]}px ${space[2]}px`} style={{ flex: 1, minInlineSize: 0 }}>
        <Flex component="span" vertical style={{ flex: '1 1 18rem', minInlineSize: 0, overflowWrap: 'anywhere' }}>
          <Typography.Text id={titleId} strong>{title}</Typography.Text>
          <Typography.Text id={contextId} type="secondary" style={{ fontSize: fontSize.meta }}>
            {meta}{meta !== '' && details !== '' ? ' · ' : null}{details}
          </Typography.Text>
        </Flex>
        {states.length === 0 ? null : <Flex id={stateId} component="span" wrap gap={space[0]}>
          {states.map((tag) => <TaskTagView key={tag.key} tag={tag} />)}
        </Flex>}
      </Flex>
      <RightOutlined aria-hidden style={{ flexShrink: 0, fontSize: fontSize.meta }} />
    </Button>
  );
}

function rowStyle(isFocused: boolean): CSSProperties {
  return {
    height: 'auto',
    minBlockSize: rowComfort,
    justifyContent: 'space-between',
    whiteSpace: 'normal',
    textAlign: 'start',
    padding: `${space[1]}px ${space[0]}px`,
    ...(isFocused ? { outline: `2px solid ${brand[600]}`, outlineOffset: 2 } : {}),
  };
}
