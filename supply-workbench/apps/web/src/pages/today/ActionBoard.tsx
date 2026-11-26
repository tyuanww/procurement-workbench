import { Alert, Button, Card, Empty, Flex, Typography } from 'antd';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ACTION_LANES, type ActionDetail, type BoardGroup, type BoardRow, type QuickAction } from '../../features/today/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { fontSize } from '../../theme/tokens.js';
import { ActionPagination, ActionResult, type ActionPageControls } from './ActionControls.js';
import { ActionToolbar, type ActionToolbarProps } from './ActionToolbar.js';
import type { ReceiptWork } from './TodayAgenda.js';
import { TodaySplit } from './TodaySplit.js';
import { TodayGroup } from './TodayGroup.js';
import { TodayRow, type CopyAction } from './TodayRow.js';
import type { CalendarTodayAdditions } from './WorkspaceViews.js';
import { isPriorityBatchSelection, selectedCalendarDay } from './action-query.js';
import { workspaceRowId } from './today-focus.js';

type BatchSequence = (rowId: string) => number | undefined;
export type ActionLane = typeof ACTION_LANES[number]['key'];

export type ActionBoardProps = ActionToolbarProps & {
  readonly batchSeqOf?: BatchSequence | undefined;
  readonly receiptOf?: ((rowId: string) => ReceiptWork | undefined) | undefined;
  readonly arrivalFocusId?: string | null | undefined;
  readonly asOf?: string | undefined;
  readonly calendarTodayAdditions?: CalendarTodayAdditions | undefined;
  readonly detailOf?: (id: string) => ActionDetail | undefined;
  readonly internalCards?: readonly ReactNode[] | undefined;
  readonly internalPagination?: ReactNode;
  readonly shortcuts?: ReactNode;
  readonly boardFocusId?: string | null;
  readonly selectedLane?: ActionLane | undefined;
  readonly onSelectLane?: (lane: ActionLane) => void;
  readonly focus: string | null;
  readonly fading: string | null;
  readonly onOpen: (id: string) => void;
  readonly onQuick: (input: { readonly id: string; readonly kind: QuickAction['kind'] }) => void;
  readonly onCopy: (text: string) => void;
};

export function ActionBoard(props: ActionBoardProps): ReactNode {
  const displayed = useDisplayedResults(props);
  const layout = displayed ?? props;
  const isList = resultView(layout) === 'list';
  const main = <Flex vertical className={isList ? 'today-action-main today-workspace-results today-list-panel' : 'today-action-main'}>
    <ActionToolbar {...props} />
    <ActionView layout={layout} displayed={displayed} current={props} isList={isList} />
  </Flex>;
  return <section id="today-chase" className="today-jump-target" tabIndex={-1} aria-label="工作台待办">
    <TodaySplit className="today-actions-layout" defaultPrimary={76}
      label="调整行动清单与事项助手宽度" primary={main}
      secondary={layout.shortcuts === undefined ? undefined :
        <div className="today-action-assistant-slot" inert={displayed !== props}>{layout.shortcuts}</div>} />
  </section>;
}

function useDisplayedResults(props: ActionBoardProps) {
  const [lastSettled, setLastSettled] = useState<ActionBoardProps>();
  const { page } = props;
  if (page === undefined) return props;
  if (page.isSettled) {
    if (lastSettled !== props) setLastSettled(props);
    return props;
  }
  if (lastSettled === undefined || !sameResultDay(lastSettled, props)) return undefined;
  if (page.loadError !== '' && resultView(lastSettled) !== resultView(props)) return undefined;
  return lastSettled;
}

function resultView({ calendar, board }: ActionBoardProps) {
  if (calendar !== undefined) return 'calendar';
  return isKanban({ board }) ? 'board' : 'list';
}

function resultDay({ page, asOf }: ActionBoardProps) {
  return selectedCalendarDay(page?.calendar, asOf) ?? (page?.inbox === 'today' ? asOf : undefined);
}

function sameResultDay(previous: ActionBoardProps, current: ActionBoardProps) {
  return previous.page?.inbox === current.page?.inbox && resultDay(previous) === resultDay(current);
}

function ActionView({ layout, displayed, current, isList }: {
  readonly layout: ActionBoardProps;
  readonly displayed: ActionBoardProps | undefined;
  readonly current: ActionBoardProps;
  readonly isList: boolean;
}) {
  const { calendar } = layout;
  const { page } = current;
  const view = useRef<HTMLDivElement>(null);
  const signature = displayed === undefined ? null : resultSignature(displayed);
  const lastSignature = useRef(signature);
  useLayoutEffect(() => {
    if (signature === null || signature === lastSignature.current) return;
    lastSignature.current = signature;
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    const animation = view.current?.animate?.([{ translate: '0 4px' }, { translate: '0 0' }], { duration: 180, easing: 'ease-out' });
    return () => animation?.cancel();
  }, [signature]);

  return <div ref={view} className={isList ? 'today-action-view' : 'today-action-view today-action-view-inset'}>
    {calendar === undefined ? <div className="today-action-results-body">
      <ResultGroups page={page} displayed={displayed} showStatus={!page?.isFiltered || page.calendar !== undefined} />
    </div> : <TodaySplit className="today-workspace-calendar-layout" defaultPrimary={46} label="调整工作日历与当日待办宽度"
      primary={current.calendar ?? <div inert>{calendar}</div>}
      secondary={<CalendarResults {...current} displayed={displayed} />} />}
  </div>;
}

function resultSignature({ board, calendar, page }: ActionBoardProps) {
  return JSON.stringify([calendar !== undefined, board.group, page?.inbox, page?.calendar, page?.work, page?.reasons, page?.sort, page?.paging.page]);
}

function CalendarResults({ displayed, ...props }: ActionBoardProps & { readonly displayed: ActionBoardProps | undefined }) {
  const { page, asOf } = props;
  const day = resultDay(props) ?? asOf;
  const label = day === undefined ? undefined : `${day} ${dayjs(day).locale('zh-cn').format('dddd')}`;
  return <Card size="small" className="today-workspace-results today-calendar-results" role="region"
    aria-label={label === undefined ? '当日结果' : `${label} ${page?.inbox === 'scheduled' ? '已约跟进' : '待办'}`}>
    <Flex className="today-calendar-heading today-calendar-result-heading" align="center" gap="small" wrap>
      {day === undefined ? null : <Typography.Title className="today-calendar-desktop" level={2}><time dateTime={day}>{label}</time></Typography.Title>}
      {page === undefined || (page.isFiltered && props.calendar === undefined) ? null :
        <ActionResult page={page} calendarCount={calendarResultTotal(props, page.paging.total)} />}
    </Flex>
    <ResultGroups page={page} displayed={displayed} />
  </Card>;
}

function calendarResultTotal(props: ActionBoardProps, total: number): number | null {
  const additions = isBusinessDay(props) ? props.calendarTodayAdditions : undefined;
  if (additions === undefined) return total;
  return additions.count === undefined ? null : total + additions.count;
}

function ResultGroups({ page, displayed, showStatus }: {
  readonly page: ActionPageControls | undefined;
  readonly displayed: ActionBoardProps | undefined;
  readonly showStatus?: boolean;
}) {
  if (page === undefined) return displayed === undefined ? null : <ActionGroups {...displayed} />;
  return <>
    {showStatus ? <ActionResult page={page} /> : null}
    {page.loadError === '' ? null : <Alert type="error" title={page.loadError} action={<Button size="small" onClick={page.onRetry}>重试</Button>} />}
    <div className="today-action-rows" aria-busy={page.isLoading} inert={!page.isSettled}>
      {displayed === undefined ? null : <ActionGroups {...displayed} />}
      {displayed?.page === undefined ? null : <ActionPagination page={displayed.page} />}
    </div>
  </>;
}

function ActionGroups(props: ActionBoardProps): ReactNode {
  const { body } = props.board;
  const hasCards = Boolean(props.internalCards?.length);
  if (isKanban(props) && (body.kind === 'groups' || hasCards)) return <ActionKanban {...props} />;
  if (body.kind === 'empty') return hasCards ? <PriorityActions {...props} rows={[]} /> : <ActionEmpty {...props} description={body.text} />;
  const groups = body.groups;
  if (groups[0]?.key === 'priority') return <PriorityActions {...props} rows={groups[0].rows} />;
  return (
    <>
      {groups.map((group) => <GroupBlock {...props} key={group.key} group={group} />)}
      {hasCards ? <PriorityActions {...props} rows={[]} /> : null}
    </>
  );
}

function PriorityActions(props: ActionBoardProps & { readonly rows: readonly BoardRow[] }) {
  const { rows, receiptOf, internalCards } = props;
  const canPrioritize = isBusinessDay(props) && (!isActionFiltered(props) || isPriorityBatchSelection(props.page?.reasons ?? [])) && props.page?.sort.kind !== 'bulk';
  const ordered = canPrioritize ? [
    ...rows.filter((row) => receiptOf?.(row.id)?.status === 'overdue'),
    ...rows.filter((row) => receiptOf?.(row.id)?.status !== 'overdue'),
  ] : rows;
  return <>
    <ActionRows {...props} rows={ordered} isPriorityList headingLevel={3} extras={internalCards} />
    {props.internalPagination}
  </>;
}

export function isBusinessDay({ page, asOf }: Pick<ActionBoardProps, 'page' | 'asOf'>): boolean {
  return page?.inbox === 'today' && (page.calendar === undefined || page.calendar === 'today' || page.calendar === asOf);
}

function ActionEmpty({ page, board, description }: ActionBoardProps & { readonly description: string }) {
  if (isActionFiltered({ board, page })) return <Empty description="当前筛选没有待办" />;
  if (page?.inbox === 'scheduled') return <Empty description={page.calendar === undefined ? '暂无已约跟进' : '这天没有已约跟进'} />;
  if (page?.inbox === 'unassigned') return <Empty description="暂无待分派事项" />;
  return <Empty description={page?.calendar === undefined ? description : '这天没有待办'}><Button href="/lines">去跟进中心</Button></Empty>;
}

function isKanban({ board }: Pick<ActionBoardProps, 'board'>): boolean {
  return board.group === 'kanban';
}

export function isActionFiltered({ board, page }: Pick<ActionBoardProps, 'board' | 'page'>): boolean {
  return page?.isFiltered === true || board.chips.some((chip) => chip.isSelected);
}

function ActionKanban(props: ActionBoardProps) {
  const groups = props.board.body.kind === 'groups' ? props.board.body.groups : [];
  const lanes = [ACTION_LANES[1], ACTION_LANES[0], ACTION_LANES[2]].map(({ key, name }) => {
    const rows = groups.find((group) => group.key === key)?.rows ?? [];
    const extras = key === 'internal' ? props.internalCards : undefined;
    return { key, name, rows, extras, count: rows.length + (extras?.length ?? 0), id: `today-lane-${key}` };
  });
  const focusedLane = laneOfFocus(lanes, props.boardFocusId);
  const active = props.selectedLane ?? focusedLane ?? lanes.find(({ count }) => count > 0)?.key ?? 'receipt';
  return <>
    <nav aria-label="看板分组" className="today-lane-links today-touch">
      {lanes.map(({ key, id, name, count }) => <Button key={key} size="small" aria-controls={id} aria-pressed={key === active}
        aria-label={`${name} ${count} 项`} onClick={() => props.onSelectLane?.(key)}>
        <span className="today-lane-name">{name}</span><span className="today-lane-count">{count}</span>
      </Button>)}
    </nav>
    <div className="today-kanban">
      {lanes.map(({ key, name, rows, extras, count, id }) => <section key={key} id={id} tabIndex={-1}
        className="today-kanban-lane today-jump-target" data-active={key === active} aria-label={name}>
        <Flex align="center" gap="small" wrap className="today-lane-heading">
          <Typography.Title level={2} style={{ margin: 0, fontSize: fontSize.section }}>{name}</Typography.Title>
          <Typography.Text type="secondary">{count} 项</Typography.Text>
        </Flex>
        {count === 0 ? <Typography.Text type="secondary">暂无待办</Typography.Text> :
          <ActionRows {...props} rows={rows} isPriorityList headingLevel={3} extras={extras} />}
        {key === 'internal' ? props.internalPagination : null}
      </section>)}
    </div>
  </>;
}

function laneOfFocus(lanes: readonly { readonly key: ActionLane; readonly rows: readonly BoardRow[] }[], id: string | null | undefined) {
  if (id == null) return undefined;
  if (id.startsWith('task:') || id.startsWith('pending:')) return 'internal';
  return lanes.find(({ rows }) => rows.some((row) => row.id === id))?.key;
}

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

type ActionRowsProps = Pick<ActionBoardProps, 'board' | 'focus' | 'fading' | 'page' | 'batchSeqOf' | 'receiptOf' | 'arrivalFocusId' | 'detailOf' | 'onOpen' | 'onQuick'> & {
  readonly group: BoardGroup;
};

function GroupBlock(props: ActionRowsProps & Pick<ActionBoardProps, 'onCopy'>): ReactNode {
  const copy = groupCopy({ group: props.group, page: props.page, onCopy: props.onCopy });
  return (
    <TodayGroup name={props.group.name} counts={props.group.counts} action={copy === null ? null :
      <Button size="small" icon={<CopyOutlined aria-hidden />} disabled={copy.disabled} onClick={copy.run}>{copy.label}</Button>}>
      <ActionRows {...props} rows={props.group.rows} isPriorityList={false} headingLevel={3} />
    </TodayGroup>
  );
}

function ActionRows(props: Omit<ActionRowsProps, 'group'> & {
  readonly rows: readonly BoardRow[];
  readonly isPriorityList: boolean;
  readonly headingLevel: 2 | 3;
  readonly extras?: readonly ReactNode[] | undefined;
}): ReactNode {
  const List = props.isPriorityList ? 'ol' : 'ul';
  const assignmentDetail = useCanWrite('lines.write') && props.page?.inbox === 'unassigned' ? props.detailOf : undefined;
  const shouldShowReminder = props.board.chips.some((chip) => chip.code === 'follow_up_due' && chip.isSelected);
  return (
    <List role="list" className={props.isPriorityList ? 'today-action-list today-priority-list' : 'today-action-list'}>
      {props.rows.map((row) => (
        <li key={row.id} id={workspaceRowId(row.id)} className="today-jump-target" tabIndex={-1}>
          <TodayRow row={row} isCard={props.isPriorityList} headingLevel={props.headingLevel} isFocused={props.focus === row.id} isFading={props.fading === row.id}
            batchSeq={props.batchSeqOf?.(row.id)} receipt={props.receiptOf?.(row.id)} arrivalFocusId={props.arrivalFocusId}
            assignmentOrder={assignmentOrder(row, assignmentDetail)} isFactoryChase={props.page?.work === 'factory_chase'}
            copy={batchCopy(props.page, row.id)} isScheduled={props.page?.inbox === 'scheduled'} showReminder={shouldShowReminder}
            onOpen={() => props.onOpen(row.id)} onQuick={(kind) => props.onQuick({ id: row.id, kind })} />
        </li>
      ))}
      {props.extras}
    </List>
  );
}

function assignmentOrder(row: BoardRow, detailOf: ActionBoardProps['detailOf']) {
  if (row.face.isUnassigned !== true) return undefined;
  const detail = detailOf?.(row.id);
  return detail?.kind === 'order' ? detail.order : undefined;
}
