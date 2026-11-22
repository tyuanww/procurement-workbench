import { Button, Empty, Result, Skeleton, Typography } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';
import type { GroupMode, PlanBoardGroup, PlanLoad, PlanRow } from '../../features/today/index.js';
import { brand, fontSize, space, statusColor, text } from '../../theme/tokens.js';
import { TaskTagView } from '../../features/plan/index.js';
import { GroupChips } from './group-chips.js';

const SCHEDULE_MODES: readonly { readonly id: GroupMode; readonly label: string }[] = [
  { id: 'schedule', label: '排期' },
  { id: 'owner', label: '负责人' },
  { id: 'supplier', label: '供应商' },
];

export type ScheduleViewProps = {
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
      <GroupChips modes={SCHEDULE_MODES} group={props.group} onGroup={props.onGroup} />
      <ScheduleBody load={props.load} focus={props.focus} onOpen={props.onOpen} onRetry={props.onRetry} />
    </>
  );
}

function ScheduleBody(props: { readonly load: PlanLoad; readonly focus: string | null; readonly onOpen: (id: string) => void; readonly onRetry: () => void }): ReactNode {
  if (props.load.kind === 'idle' || props.load.kind === 'loading') return <Skeleton active paragraph={{ rows: 6 }} />;
  if (props.load.kind === 'error') return <Result status="error" title="排期没有读出来" subTitle={props.load.message} extra={<Button type="primary" onClick={props.onRetry}>重试</Button>} />;
  if (props.load.board.kind === 'empty') return <Empty description={props.load.board.text}><Button href="/imports">去导入排期里程碑</Button></Empty>;
  return <>{props.load.board.groups.map((group) => <PlanGroupBlock key={group.key} group={group} focus={props.focus} onOpen={props.onOpen} />)}</>;
}

function PlanGroupBlock(props: { readonly group: PlanBoardGroup; readonly focus: string | null; readonly onOpen: (id: string) => void }): ReactNode {
  return (
    <div style={groupStyle()}>
      <PlanHead group={props.group} />
      <div>
        {props.group.rows.map((row) => <PlanTaskRow key={row.id} row={row} isUnassigned={props.group.isUnassigned} isKeyboardFocused={props.focus === row.id} onOpen={() => props.onOpen(row.id)} />)}
      </div>
    </div>
  );
}

function PlanHead(props: { readonly group: PlanBoardGroup }): ReactNode {
  return (
    <div style={headStyle()}>
      <span style={titleStyle()}>{props.group.name}</span>
      {props.group.counts.map((count) => <span key={count.label} style={countStyle()}>{count.label} {count.count}</span>)}
      {props.group.note === null ? null : <span style={noteStyle()}>{props.group.note}</span>}
    </div>
  );
}

function PlanTaskRow(props: { readonly row: PlanRow; readonly isUnassigned: boolean; readonly isKeyboardFocused: boolean; readonly onOpen: () => void }): ReactNode {
  const [isFocused, setFocused] = useState(false);
  return (
    <div
      className="today-task-row"
      role="button"
      tabIndex={0}
      style={rowStyle({ isFocused: isFocused || props.isKeyboardFocused, isUnassigned: props.isUnassigned })}
      onClick={props.onOpen}
      onKeyDown={(event) => openOnKey({ event, onOpen: props.onOpen })}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <TaskFace row={props.row} />
      <Button size="small" onClick={(event) => { event.stopPropagation(); props.onOpen(); }}>打开</Button>
    </div>
  );
}

function openOnKey(input: { readonly event: { readonly key: string; readonly preventDefault: () => void }; readonly onOpen: () => void }): void {
  if (input.event.key !== 'Enter' && input.event.key !== ' ') return;
  input.event.preventDefault();
  input.onOpen();
}

function TaskFace(props: { readonly row: PlanRow }): ReactNode {
  return (
    <div style={faceStyle()}>
      <Typography.Text strong style={taskTitleStyle()}>{props.row.title}</Typography.Text>
      <Typography.Text type="secondary" style={metaStyle()}>{props.row.meta}</Typography.Text>
      <div style={tagRowStyle()}>
        {props.row.tags.map((tag) => <TaskTagView key={tag.key} tag={tag} />)}
      </div>
    </div>
  );
}

function groupStyle(): CSSProperties {
  return { marginBottom: space[3] };
}

function headStyle(): CSSProperties {
  return {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space[1],
    paddingBottom: space[1],
    borderBottom: `1px solid ${statusColor.neutral.border}`,
  };
}

function titleStyle(): CSSProperties {
  return { color: text.primary, fontSize: fontSize.section, fontWeight: 600 };
}

function countStyle(): CSSProperties {
  return { color: text.secondary, fontSize: fontSize.body };
}

function noteStyle(): CSSProperties {
  return { color: text.tertiary, fontSize: fontSize.meta };
}

function rowStyle(input: { readonly isFocused: boolean; readonly isUnassigned: boolean }): CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[3],
    padding: `${space[2]}px ${space[1]}px`,
    borderBottom: `1px solid ${statusColor.neutral.border}`,
    borderLeft: input.isUnassigned ? `3px solid ${statusColor.warning.text}` : '3px solid transparent',
    background: input.isUnassigned ? statusColor.warning.bg : 'transparent',
    cursor: 'pointer',
    outline: input.isFocused ? `2px solid ${brand[600]}` : 'none',
  };
}

function faceStyle(): CSSProperties {
  return { display: 'flex', flexDirection: 'column', gap: space[0], minWidth: 0 };
}

function taskTitleStyle(): CSSProperties {
  return { fontSize: fontSize.body, lineHeight: '20px' };
}

function metaStyle(): CSSProperties {
  return { fontSize: fontSize.meta };
}

function tagRowStyle(): CSSProperties {
  return { display: 'flex', flexWrap: 'wrap', gap: space[1] };
}
