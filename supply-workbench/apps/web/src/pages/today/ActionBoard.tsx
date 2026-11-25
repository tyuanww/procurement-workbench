import { Alert, Button, Card, Collapse, Dropdown, Empty, Flex, Spin, Tag, Typography } from 'antd';
import { useRef, useState, type ReactNode } from 'react';
import { CopyOutlined, DownOutlined } from '@ant-design/icons';
import { ACTION_LANES, actionIcon, FaceBlock, rowStyle, type BoardGroup, type BoardRow, type GroupMode, type QuickAction, type ReasonChip, type TodayBoard } from '../../features/today/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { fontSize } from '../../theme/tokens.js';
import { ActionControls, ActionPagination, ActionResult, ChaseControls, type ActionPageControls } from './ActionControls.js';
import { TodayGroup, TodayGrouping } from './TodayGroup.js';

const ACTION_VIEWS: readonly { readonly id: GroupMode; readonly label: string }[] = [
  { id: 'kanban', label: '看板' },
  { id: 'priority', label: '清单' },
];

const LIST_GROUPS: typeof ACTION_VIEWS = [
  { id: 'priority', label: '不分组' },
  { id: 'waiting', label: '等待方' },
  { id: 'reason', label: '原因' },
  { id: 'date', label: '日期' },
];

type BatchSequence = (rowId: string) => number | undefined;
type KanbanExtras = Partial<Record<typeof ACTION_LANES[number]['key'], {
  readonly cards: readonly ReactNode[];
  readonly footer?: ReactNode;
}>>;

export type ActionBoardProps = {
  readonly board: TodayBoard;
  readonly page: ActionPageControls | undefined;
  readonly hasOtherWork: boolean;
  readonly batchSeqOf?: BatchSequence | undefined;
  readonly renderArrival?: ((rowId: string) => ReactNode) | undefined;
  readonly kanbanExtras?: KanbanExtras | undefined;
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
  const view = board.group === 'kanban' ? 'kanban' : 'priority';
  return (
    <section id="today-chase" className="today-jump-target" tabIndex={-1} aria-label="行动板待办">
      <Flex vertical gap="small">
        <ActionHeading page={page} isKanban={isKanban(props)} />
        <Flex className="today-touch" align="center" gap="small" wrap>
          {page?.sort.kind === 'bulk' ? null : <TodayGrouping label="行动板视图" modes={ACTION_VIEWS} group={view} onGroup={props.onGroup} />}
          {page === undefined ? null : <ActionControls page={page} />}
        </Flex>
        <ActionOptions {...props} />
        {page === undefined ? <ActionGroups {...props} /> : <PagedGroups {...props} page={page} />}
      </Flex>
    </section>
  );
}

function ActionHeading({ page, isKanban }: { readonly page: ActionBoardProps['page']; readonly isKanban: boolean }) {
  if (isKanban && page?.isFiltered !== true) return null;
  const work = page?.work;
  const title = work === 'factory_chase' ? '要催货' : work === 'internal_note' ? '内部等回单' : '行动清单';
  return <Flex className="today-touch" align="center" gap="small" wrap>
    <Typography.Title level={2} style={{ margin: 0 }}>{title}</Typography.Title>
    {page?.isFiltered !== true ? null : <Button size="small" onClick={(event) => {
      event.currentTarget.closest('section')?.focus({ preventScroll: true });
      page.onWork();
    }}>查看全部待办</Button>}
  </Flex>;
}

function ActionOptions({ board, page, onGroup, onToggleReason }: ActionBoardProps) {
  const selected = board.chips.filter((chip) => chip.isSelected);
  const canGroupList = board.group !== 'kanban' && page?.sort.kind !== 'bulk';
  const filterLabel = page === undefined ? '筛选' : '筛选与复制催单';
  const label = canGroupList ? `分组、${filterLabel}` : filterLabel;
  return <Collapse size="small" items={[{
    key: 'options',
    label: selected.length === 0 ? label : `${label}（${selected.map((chip) => chip.label).join('、')}）`,
    children: <Flex vertical gap="small">
      {canGroupList ? <Flex className="today-touch" align="center" gap="small" wrap>
        <Typography.Text>清单分组</Typography.Text>
        <TodayGrouping label="清单分组" modes={LIST_GROUPS} group={board.group} onGroup={onGroup} />
      </Flex> : null}
      <search className="today-touch" aria-label="行动板筛选">
        <ReasonChips chips={board.chips} onToggle={onToggleReason} />
      </search>
      {page === undefined ? null : <ChaseControls page={page} />}
    </Flex>,
  }]} />;
}

function PagedGroups(props: ActionBoardProps & { readonly page: ActionPageControls }) {
  const { page } = props;
  return <>
    <ActionResult page={page} isKanban={isKanban(props)} />
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
  const hasCards = Object.values(props.kanbanExtras ?? {}).some((extra) => extra.cards.length > 0);
  if (isKanban(props) && (props.board.body.kind === 'groups' || hasCards)) {
    return <ActionKanban {...props} />;
  }
  if (props.board.body.kind === 'empty') return <ActionEmpty {...props} description={props.board.body.text} />;
  return (
    <>
      {props.board.body.groups.map((group) => (
        <GroupBlock key={group.key} group={group} focus={props.focus} fading={props.fading} onOpen={props.onOpen} onQuick={props.onQuick}
          page={props.page} batchSeqOf={props.batchSeqOf} renderArrival={props.renderArrival} onCopy={props.onCopy} />
      ))}
    </>
  );
}

function ActionEmpty({ page, board, hasOtherWork, description }: ActionBoardProps & { readonly description: string }) {
  if (isActionFiltered({ board, page })) return <Empty description="当前筛选没有待办" />;
  if (hasOtherWork) return null;
  return <Empty description={description}><Button href="/lines">去跟进中心</Button></Empty>;
}

export function isKanban({ board, page }: Pick<ActionBoardProps, 'board' | 'page'>): boolean {
  return board.group === 'kanban' && page?.sort.kind !== 'bulk';
}

export function isActionFiltered({ board, page }: Pick<ActionBoardProps, 'board' | 'page'>): boolean {
  return page?.isFiltered === true || board.chips.some((chip) => chip.isSelected);
}

function ActionKanban(props: ActionBoardProps) {
  const groups = props.board.body.kind === 'groups' ? props.board.body.groups : [];
  const headingLevel = props.page?.isFiltered === true ? 3 : 2;
  return <div className="today-kanban">
    {ACTION_LANES.map(({ key, name }) => {
      const rows = groups.find((group) => group.key === key)?.rows ?? [];
      const extras = props.kanbanExtras?.[key];
      const count = rows.length + (extras?.cards.length ?? 0);
      return <section key={key} className="today-kanban-lane" aria-label={name}>
        <Flex align="center" gap="small" wrap>
          <Typography.Title level={headingLevel} style={{ margin: 0, fontSize: fontSize.section }}>{name}</Typography.Title>
          <Typography.Text type="secondary">{count} 项</Typography.Text>
        </Flex>
        {count === 0 ? <Typography.Text type="secondary">暂无待办</Typography.Text> :
          <ActionRows {...props} rows={rows} isPriorityList isCompact extras={extras?.cards} />}
        {extras?.footer}
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

type ActionRowsProps = Pick<ActionBoardProps, 'focus' | 'fading' | 'page' | 'batchSeqOf' | 'renderArrival' | 'onOpen' | 'onQuick'> & {
  readonly group: BoardGroup;
};

function GroupBlock(props: ActionRowsProps & Pick<ActionBoardProps, 'onCopy'>): ReactNode {
  if (props.group.key === 'priority') return <ActionRows {...props} rows={props.group.rows} isPriorityList />;
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
        <li key={row.id}>
          <TodayRow row={row} isCard={props.isPriorityList} isFocused={props.focus === row.id} isFading={props.fading === row.id}
            isCompact={props.isCompact === true}
            batchSeq={props.batchSeqOf?.(row.id)} arrival={props.renderArrival?.(row.id)} copy={batchCopy(props.page, row.id)}
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
  readonly arrival: ReactNode;
  readonly copy: CopyAction | null;
  readonly onOpen: () => void;
  readonly onQuick: (kind: QuickAction['kind']) => void;
}): ReactNode {
  const style = rowStyle({ isFocused: props.isFocused, isFading: props.isFading });
  const content = (
    <Flex className={props.isCompact ? undefined : 'today-row-layout'} vertical gap="small" wrap>
      <Flex className="today-row-facts" vertical>
        <FaceBlock face={props.row.face} batchSeq={props.batchSeq} isCompact={props.isCompact} />
        {props.arrival}
      </Flex>
      <RowActions {...props} hasArrival={Boolean(props.arrival)} />
    </Flex>
  );
  return props.isCard
    ? <article><Card className="today-row" size="small" style={style}>{content}</Card></article>
    : <div className="today-row today-grouped-row" style={style}>{content}</div>;
}

function RowActions({ row, batchSeq, copy, hasArrival, onOpen, onQuick }: {
  readonly row: BoardRow;
  readonly batchSeq: number | undefined;
  readonly copy: CopyAction | null;
  readonly hasArrival: boolean;
  readonly onOpen: () => void;
  readonly onQuick: (kind: QuickAction['kind']) => void;
}): ReactNode {
  const canRecord = useCanWrite('records.write');
  const actions = canRecord ? row.actions : [];
  const primary = preferredAction({ actions, hasCopy: copy !== null, hasArrival });
  const isCopyPrimary = copy !== null && primary === undefined;
  const remaining = actions.filter((action) => action.kind !== primary?.kind);
  const { orderNo, productName } = row.face;
  const batch = batchSeq === undefined ? '' : ` · 第 ${batchSeq} 批`;
  const identity = [orderNo, productName].filter((value) => value !== '—').join(' · ') + batch;
  return (
    <Flex className="today-touch today-row-actions" align="center" gap="small" wrap>
      {primary === undefined ? null : <Button type="primary" size="small" icon={actionIcon(primary.kind)} onClick={() => onQuick(primary.kind)}>{primary.label}</Button>}
      {copy === null ? null : <CopyButton copy={copy} primary={isCopyPrimary} />}
      <Button type={primary === undefined && !isCopyPrimary ? 'primary' : 'text'} size="small" onClick={onOpen} aria-label={`查看详情 ${identity}`}>查看详情</Button>
      <RowMenu actions={remaining} identity={identity} onQuick={onQuick} />
    </Flex>
  );
}

function preferredAction({ actions, hasCopy, hasArrival }: {
  readonly actions: readonly QuickAction[];
  readonly hasCopy: boolean;
  readonly hasArrival: boolean;
}): QuickAction | undefined {
  const first = actions[0];
  if (!hasCopy || first?.kind === 'date') return first;
  if (!hasArrival || !actions.some((action) => action.kind === 'note')) return undefined;
  return { kind: 'note', label: '跟进工厂' };
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

