import { Alert, Button, Empty, Flex, Spin, Typography } from 'antd';
import type { ReactNode } from 'react';
import { CopyOutlined } from '@ant-design/icons';
import { ACTION_LANES, type BoardGroup, type BoardRow, type QuickAction } from '../../features/today/index.js';
import { fontSize } from '../../theme/tokens.js';
import { ActionPagination, ActionResult, ChasePreviewDialog, type ActionPageControls } from './ActionControls.js';
import { ActionToolbar, type ActionToolbarProps } from './ActionToolbar.js';
import type { ReceiptWork } from './TodayAgenda.js';
import { TodayGroup } from './TodayGroup.js';
import { TodayRow, type CopyAction } from './TodayRow.js';
import { focusSection, workspaceRowId } from './today-focus.js';

type BatchSequence = (rowId: string) => number | undefined;
export type ActionBoardProps = ActionToolbarProps & {
  readonly batchSeqOf?: BatchSequence | undefined;
  readonly receiptOf?: ((rowId: string) => ReceiptWork | undefined) | undefined;
  readonly arrivalFocusId?: string | null | undefined;
  readonly internalCards?: readonly ReactNode[] | undefined;
  readonly internalPagination?: ReactNode;
  readonly focus: string | null;
  readonly fading: string | null;
  readonly onOpen: (id: string) => void;
  readonly onQuick: (input: { readonly id: string; readonly kind: QuickAction['kind'] }) => void;
  readonly onCopy: (text: string) => void;
};

export function ActionBoard(props: ActionBoardProps): ReactNode {
  const { page } = props;
  return (
    <section id="today-chase" className="today-jump-target" tabIndex={-1} aria-label="工作台待办">
      <Flex vertical gap="small">
        <ActionToolbar {...props} />
        {props.calendar}
        {page === undefined ? <ActionGroups {...props} /> : <PagedGroups {...props} page={page} />}
      </Flex>
    </section>
  );
}

function PagedGroups(props: ActionBoardProps & { readonly page: ActionPageControls }) {
  const { page } = props;
  return <>
    <ActionResult page={page} />
    <ChasePreviewDialog page={page} />
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
  return <>
    {props.board.group === 'priority' && props.rows.length > 0 && Boolean(props.internalCards?.length) ?
      <Typography.Text type="secondary">批次按紧急度排列，之后是到期排期和待建批次。</Typography.Text> : null}
    <ActionRows {...props} isPriorityList headingLevel={2} extras={props.internalCards} />
    {props.internalPagination}
  </>;
}

function ActionEmpty({ page, board, description }: ActionBoardProps & { readonly description: string }) {
  if (isActionFiltered({ board, page })) return <Empty description="当前筛选没有待办" />;
  if (page?.inbox === 'scheduled') return <Empty description={page.calendar === undefined ? '暂无已约跟进' : '这天没有已约跟进'} />;
  if (page?.inbox === 'unassigned') return <Empty description="暂无待分派事项" />;
  return <Empty description={page?.calendar === undefined ? description : '这天没有待办'}><Button href="/lines">去跟进中心</Button></Empty>;
}

export function isKanban({ board, page }: Pick<ActionBoardProps, 'board' | 'page'>): boolean {
  return board.group === 'kanban' && page?.sort.kind !== 'bulk';
}

export function isActionFiltered({ board, page }: Pick<ActionBoardProps, 'board' | 'page'>): boolean {
  return page?.isFiltered === true || board.chips.some((chip) => chip.isSelected);
}

function ActionKanban(props: ActionBoardProps) {
  const groups = props.board.body.kind === 'groups' ? props.board.body.groups : [];
  const lanes = ACTION_LANES.map(({ key, name }) => {
    const rows = groups.find((group) => group.key === key)?.rows ?? [];
    const extras = key === 'internal' ? props.internalCards : undefined;
    return { key, name, rows, extras, count: rows.length + (extras?.length ?? 0), id: `today-lane-${key}` };
  });
  return <>
    <nav aria-label="看板分组" className="today-lane-links today-touch">
      {lanes.map(({ id, name, count }) => <Button key={id} size="small" href={`#${id}`} onClick={(event) => {
        event.preventDefault();
        focusSection(id);
      }}><span>{name}</span><span>{count} 项</span></Button>)}
    </nav>
    <div className="today-kanban">
      {lanes.map(({ key, name, rows, extras, count, id }) => <section key={key} id={id} tabIndex={-1}
        className="today-kanban-lane today-jump-target" aria-label={name}>
        <Flex align="center" gap="small" wrap>
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

type ActionRowsProps = Pick<ActionBoardProps, 'focus' | 'fading' | 'page' | 'batchSeqOf' | 'receiptOf' | 'arrivalFocusId' | 'onOpen' | 'onQuick'> & {
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
  return (
    <List role="list" className={props.isPriorityList ? 'today-action-list today-priority-list' : 'today-action-list'}>
      {props.rows.map((row) => (
        <li key={row.id} id={workspaceRowId(row.id)} className="today-jump-target" tabIndex={-1}>
          <TodayRow row={row} isCard={props.isPriorityList} headingLevel={props.headingLevel} isFocused={props.focus === row.id} isFading={props.fading === row.id}
            batchSeq={props.batchSeqOf?.(row.id)} receipt={props.receiptOf?.(row.id)} arrivalFocusId={props.arrivalFocusId}
            copy={batchCopy(props.page, row.id)} isScheduled={props.page?.inbox === 'scheduled'}
            onOpen={() => props.onOpen(row.id)} onQuick={(kind) => props.onQuick({ id: row.id, kind })} />
        </li>
      ))}
      {props.extras}
    </List>
  );
}
