import { Alert, Button, Card, Dropdown, Empty, Flex, Spin, Typography } from 'antd';
import { useRef, useState, type ReactNode } from 'react';
import { CopyOutlined, DownOutlined } from '@ant-design/icons';
import { ACTION_LANES, actionIcon, FaceBlock, rowStyle, type BoardGroup, type BoardRow, type QuickAction } from '../../features/today/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { fontSize } from '../../theme/tokens.js';
import { ActionPagination, ActionResult, type ActionPageControls } from './ActionControls.js';
import { ActionToolbar, type ActionToolbarProps } from './ActionToolbar.js';
import { ReceiptAction, ReceiptFacts, type ReceiptWork } from './TodayAgenda.js';
import { TodayGroup } from './TodayGroup.js';
import { workspaceRowId } from './today-focus.js';

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
    <ActionRows {...props} isPriorityList extras={props.internalCards} />
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
  return <div className="today-kanban">
    {ACTION_LANES.map(({ key, name }) => {
      const rows = groups.find((group) => group.key === key)?.rows ?? [];
      const extras = key === 'internal' ? props.internalCards : undefined;
      const count = rows.length + (extras?.length ?? 0);
      return <section key={key} className="today-kanban-lane" aria-label={name}>
        <Flex align="center" gap="small" wrap>
          <Typography.Title level={2} style={{ margin: 0, fontSize: fontSize.section }}>{name}</Typography.Title>
          <Typography.Text type="secondary">{count} 项</Typography.Text>
        </Flex>
        {count === 0 ? <Typography.Text type="secondary">暂无待办</Typography.Text> :
          <ActionRows {...props} rows={rows} isPriorityList isCompact extras={extras} />}
        {key === 'internal' ? props.internalPagination : null}
      </section>;
    })}
  </div>;
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

type ActionRowsProps = Pick<ActionBoardProps, 'focus' | 'fading' | 'page' | 'batchSeqOf' | 'receiptOf' | 'arrivalFocusId' | 'onOpen' | 'onQuick'> & {
  readonly group: BoardGroup;
};

function GroupBlock(props: ActionRowsProps & Pick<ActionBoardProps, 'onCopy'>): ReactNode {
  const copy = groupCopy({ group: props.group, page: props.page, onCopy: props.onCopy });
  return (
    <TodayGroup name={props.group.name} counts={props.group.counts} action={copy === null ? null :
      <Button size="small" icon={<CopyOutlined aria-hidden />} disabled={copy.disabled} onClick={copy.run}>{copy.label}</Button>}>
      <ActionRows {...props} rows={props.group.rows} isPriorityList={false} />
    </TodayGroup>
  );
}

function ActionRows(props: Omit<ActionRowsProps, 'group'> & {
  readonly rows: readonly BoardRow[];
  readonly isPriorityList: boolean;
  readonly isCompact?: boolean;
  readonly extras?: readonly ReactNode[] | undefined;
}): ReactNode {
  const List = props.isPriorityList ? 'ol' : 'ul';
  return (
    <List role="list" className={props.isPriorityList ? 'today-action-list today-priority-list' : 'today-action-list'}>
      {props.rows.map((row) => (
        <li key={row.id} id={workspaceRowId(row.id)} className="today-jump-target" tabIndex={-1}>
          <TodayRow row={row} isCard={props.isPriorityList} isFocused={props.focus === row.id} isFading={props.fading === row.id}
            isCompact={props.isCompact === true}
            batchSeq={props.batchSeqOf?.(row.id)} receipt={props.receiptOf?.(row.id)} arrivalFocusId={props.arrivalFocusId}
            copy={batchCopy(props.page, row.id)} isScheduled={props.page?.inbox === 'scheduled'}
            onOpen={() => props.onOpen(row.id)} onQuick={(kind) => props.onQuick({ id: row.id, kind })} />
        </li>
      ))}
      {props.extras}
    </List>
  );
}

function TodayRow(props: {
  readonly row: BoardRow;
  readonly isCard: boolean;
  readonly isCompact: boolean;
  readonly isFocused: boolean;
  readonly isFading: boolean;
  readonly batchSeq: number | undefined;
  readonly receipt: ReceiptWork | undefined;
  readonly arrivalFocusId: string | null | undefined;
  readonly copy: CopyAction | null;
  readonly isScheduled: boolean;
  readonly onOpen: () => void;
  readonly onQuick: (kind: QuickAction['kind']) => void;
}): ReactNode {
  const style = rowStyle({ isFocused: props.isFocused, isFading: props.isFading });
  const content = (
    <Flex className={props.isCompact ? undefined : 'today-row-layout'} vertical gap="small" wrap>
      <Flex className="today-row-facts" vertical>
        <FaceBlock face={props.row.face} batchSeq={props.batchSeq} isCompact={props.isCompact} />
        {props.receipt === undefined ? null : <ReceiptFacts {...props.receipt} />}
      </Flex>
      <RowActions {...props} />
    </Flex>
  );
  return props.isCard
    ? <article><Card className="today-row" data-receipt={props.receipt !== undefined || undefined} size="small" style={style}>{content}</Card></article>
    : <div className="today-row today-grouped-row" data-receipt={props.receipt !== undefined || undefined} style={style}>{content}</div>;
}

function RowActions({ row, batchSeq, copy, receipt, arrivalFocusId, isScheduled, onOpen, onQuick }: {
  readonly row: BoardRow;
  readonly batchSeq: number | undefined;
  readonly copy: CopyAction | null;
  readonly receipt: ReceiptWork | undefined;
  readonly arrivalFocusId: string | null | undefined;
  readonly isScheduled: boolean;
  readonly onOpen: () => void;
  readonly onQuick: (kind: QuickAction['kind']) => void;
}): ReactNode {
  const canRecord = useCanWrite('records.write');
  const actions = canRecord ? row.actions : [];
  const primary = receipt === undefined ? preferredAction({ actions, hasCopy: copy !== null, isScheduled }) : undefined;
  const hasPrimary = receipt !== undefined || primary !== undefined;
  const remaining = actions.filter((action) => action.kind !== primary?.kind);
  const { orderNo, productName } = row.face;
  const batch = batchSeq === undefined ? '' : ` · 第 ${batchSeq} 批`;
  const identity = [orderNo, productName].filter((value) => value !== '—').join(' · ') + batch;
  return (
    <Flex className="today-touch today-row-actions" align="center" gap="small" wrap>
      {receipt === undefined ? null : <ReceiptAction memo={receipt.memo} isFocused={arrivalFocusId === receipt.memo.batchId} />}
      {primary === undefined ? null : <Button type="primary" size="small" icon={actionIcon(primary.kind)} onClick={() => onQuick(primary.kind)}>{primary.label}</Button>}
      {copy === null ? null : <CopyButton copy={copy} primary={!hasPrimary} />}
      <Button type={hasPrimary || copy !== null ? 'text' : 'primary'} size="small" onClick={onOpen} aria-label={`查看详情 ${identity}`}>查看详情</Button>
      <RowMenu actions={remaining} identity={identity} onQuick={onQuick} />
    </Flex>
  );
}

function preferredAction({ actions, hasCopy, isScheduled }: {
  readonly actions: readonly QuickAction[];
  readonly hasCopy: boolean;
  readonly isScheduled: boolean;
}): QuickAction | undefined {
  if (isScheduled) return actions.find((action) => action.kind === 'note') ?? actions[0];
  const first = actions[0];
  return !hasCopy || first?.kind === 'date' ? first : undefined;
}

function RowMenu({ actions, identity, onQuick }: {
  readonly actions: readonly QuickAction[];
  readonly identity: string;
  readonly onQuick: (kind: QuickAction['kind']) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [isOpen, setOpen] = useState(false);
  if (actions.length === 0) return null;
  return <Dropdown trigger={['click']} autoFocus open={isOpen} onOpenChange={setOpen} menu={{ items: actions.map((action) => ({
    key: action.kind, label: action.label, icon: actionIcon(action.kind),
    onClick: () => { trigger.current?.focus(); onQuick(action.kind); },
  })) }}>
    <Button ref={trigger} type="text" size="small" aria-haspopup="menu" aria-expanded={isOpen} aria-label={`更多操作 ${identity}`} icon={<DownOutlined aria-hidden />} iconPlacement="end">更多</Button>
  </Dropdown>;
}

function CopyButton({ copy, primary }: { readonly copy: CopyAction; readonly primary: boolean }) {
  return <Button type={primary ? 'primary' : 'text'} size="small" icon={<CopyOutlined aria-hidden />} disabled={copy.disabled} onClick={copy.run}>{copy.label}</Button>;
}

