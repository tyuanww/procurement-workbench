import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { Alert, Button, Empty, Flex, Result, Skeleton, Typography } from 'antd';
import { Link, useInRouterContext } from 'react-router';
import type { CSSProperties, ReactNode } from 'react';
import type { GroupMode, PlanBoardGroup, PlanLoad, PlanRow } from '../../features/today/index.js';
import { brand, fontSize, space, statusColor } from '../../theme/tokens.js';
import { TaskTagView } from '../../features/plan/index.js';
import { useCan } from '../../shared/actor.js';
import { TodayGroup, TodayGrouping } from './TodayGroup.js';

const SCHEDULE_MODES: readonly { readonly id: GroupMode; readonly label: string }[] = [
  { id: 'schedule', label: '排期' },
  { id: 'owner', label: '负责人' },
  { id: 'supplier', label: '供应商' },
];

export type ScheduleViewProps = {
  readonly isMine?: boolean;
  readonly returnSearch?: string;
  readonly group: GroupMode;
  readonly load: PlanLoad;
  readonly focus: string | null;
  readonly onGroup: (group: GroupMode) => void;
  readonly onOpen: (id: string) => void;
  readonly onRetry: () => void;
};

export function ScheduleView(props: ScheduleViewProps): ReactNode {
  return (
    <>
      <Flex className="today-touch" wrap align="center" gap={space[2]}>
        <PlanScope isMine={props.isMine === true} group={props.group} returnSearch={props.returnSearch ?? ''} />
        <TodayGrouping label="今日排期分组" modes={SCHEDULE_MODES} group={props.group} onGroup={props.onGroup} />
        <ProcurementCutoff />
      </Flex>
      <ScheduleBody load={props.load} focus={props.focus} onOpen={props.onOpen} onRetry={props.onRetry} />
    </>
  );
}

function PlanScope({ isMine, group, returnSearch }: { readonly isMine: boolean; readonly group: GroupMode; readonly returnSearch: string }) {
  const isRouted = useInRouterContext();
  const query = new URLSearchParams({ group });
  if (!isMine) query.set('mine', '1');
  if (returnSearch !== '') query.set('workspaceReturn', returnSearch);
  const returnPath = returnSearch === '' ? '/today' : '/today?' + new URLSearchParams(returnSearch);
  if (!isRouted) return null;
  return <Flex gap="small" align="center" wrap>
    <Link to={returnPath}>返回个人工作台</Link>
    <Typography.Text strong>{isMine ? '我的到期排期' : '全部可见排期'}</Typography.Text>
    <Link to={'/today?' + query}>{isMine ? '查看全部可见排期' : '只看我的到期排期'}</Link>
  </Flex>;
}

function ScheduleBody(props: { readonly load: PlanLoad; readonly focus: string | null; readonly onOpen: (id: string) => void; readonly onRetry: () => void }): ReactNode {
  const canReadImports = useCan('imports.read');
  if (props.load.kind === 'idle' || props.load.kind === 'loading') return <Skeleton active paragraph={{ rows: 6 }} />;
  if (props.load.kind === 'error') return <Result status="error" title="排期没有读出来" subTitle={props.load.message} extra={<Button type="primary" onClick={props.onRetry}>重试</Button>} />;
  if (props.load.board.kind === 'empty') {
    return <Empty description={props.load.board.text}>{canReadImports ? <Button href="/imports">去导入排期里程碑</Button> : null}</Empty>;
  }
  return <>{props.load.board.groups.map((group) => <PlanGroupBlock key={group.key} group={group} focus={props.focus} onOpen={props.onOpen} />)}</>;
}

function PlanGroupBlock(props: { readonly group: PlanBoardGroup; readonly focus: string | null; readonly onOpen: (id: string) => void }): ReactNode {
  return (
    <TodayGroup name={props.group.name} counts={props.group.counts}>
      {props.group.note === null ? null : <Alert type={props.group.isUnassigned ? 'warning' : 'info'} title={props.group.note} showIcon />}
      {props.group.rows.map((row) => <PlanTaskRow key={row.id} row={row} isKeyboardFocused={props.focus === row.id} onOpen={() => props.onOpen(row.id)} />)}
    </TodayGroup>
  );
}

function PlanTaskRow(props: { readonly row: PlanRow; readonly isKeyboardFocused: boolean; readonly onOpen: () => void }): ReactNode {
  const { title, meta, tags } = props.row;
  const label = [title, meta, ...tags.map((tag) => tag.label), '打开'].filter(Boolean).join(' · ');
  return (
    <Button className="today-task-row" type="text" block style={rowStyle(props.isKeyboardFocused)}
      aria-label={label} onClick={props.onOpen}>
      <TaskFace row={props.row} />
      <Typography.Text type="secondary" style={{ flexShrink: 0 }}>打开</Typography.Text>
    </Button>
  );
}

function TaskFace(props: { readonly row: PlanRow }): ReactNode {
  return (
    <Flex component="span" vertical gap={space[0]} style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      <Typography.Text strong>{props.row.title}</Typography.Text>
      <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{props.row.meta}</Typography.Text>
      <Flex component="span" wrap gap={space[1]}>
        {props.row.tags.map((tag) => <TaskTagView key={tag.key} tag={tag} />)}
      </Flex>
    </Flex>
  );
}

function rowStyle(isFocused: boolean): CSSProperties {
  return {
    height: 'auto',
    minBlockSize: 44,
    justifyContent: 'space-between',
    whiteSpace: 'normal',
    textAlign: 'start',
    padding: `${space[2]}px ${space[1]}px`,
    borderBottom: `1px solid ${statusColor.neutral.border}`,
    borderRadius: 0,
    ...(isFocused ? { outline: `2px solid ${brand[600]}`, outlineOffset: 2 } : {}),
  };
}
