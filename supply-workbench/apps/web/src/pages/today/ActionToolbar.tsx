import { Button, Flex, Modal, Typography } from 'antd';
import { CopyOutlined, FilterOutlined } from '@ant-design/icons';
import type { TodayWorkFilter } from '@sw/contracts';
import { useEffect, useRef, useState, type ReactNode, type Ref, type RefObject } from 'react';
import type { GroupMode, ReasonChip, TodayBoard } from '../../features/today/index.js';
import { actionDialogStyles, actionDialogTarget, ActionResult, SortControls, workFilterLabels, type ActionPageControls } from './ActionControls.js';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { isPriorityBatchSelection, PRIORITY_BATCH_REASONS, type WorkspaceFilterSelection } from './action-query.js';
import { ChaseCopyDialog } from './ChaseCopyDialog.js';
import { focusSection } from './today-focus.js';
import { TodayGrouping } from './TodayGroup.js';
import { WorkspaceMenu } from './WorkspaceMenu.js';

type CloseAndJump = (jump: () => void) => void;

export type ActionToolbarProps = {
  readonly board: TodayBoard;
  readonly page: ActionPageControls | undefined;
  readonly viewControls?: ReactNode;
  readonly scopeControls?: ReactNode;
  readonly utilityLinks?: ((onJump: CloseAndJump) => ReactNode) | undefined;
  readonly calendar?: ReactNode;
  readonly onApplyFilters?: (selection: WorkspaceFilterSelection) => void;
};

type ToolbarDialog =
  | { readonly kind: 'filter'; readonly draft: WorkspaceFilterSelection }
  | { readonly kind: 'chase' };

const LIST_GROUPS: readonly { readonly id: GroupMode; readonly label: string }[] = [
  { id: 'priority', label: '不分组' },
  { id: 'waiting', label: '等待方' },
  { id: 'reason', label: '原因' },
  { id: 'date', label: '日期' },
];

const CLEARED_FILTERS: WorkspaceFilterSelection = { reasons: [], work: undefined, sort: { kind: 'urgency' }, group: undefined };

export function ActionToolbar(props: ActionToolbarProps) {
  const { board, page, viewControls } = props;
  const [dialog, setDialog] = useState<ToolbarDialog | null>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const toolsButton = useRef<HTMLButtonElement>(null);
  const clearPending = useRef(false);
  const { isFiltered, inbox, copyNotice } = page ?? {};
  const preset = priorityPreset(props);
  const selection = appliedFilterLabels({ chips: board.chips, page, preset });
  const chasePage = inbox === 'today' ? page : undefined;
  const draft = dialog?.kind === 'filter' ? dialog.draft : null;
  const isChaseOpen = dialog?.kind === 'chase';
  const close = () => setDialog(null);

  useEffect(() => {
    if (!isFiltered) clearPending.current = false;
  }, [isFiltered]);

  function openFilters() {
    const draft = clearPending.current ? CLEARED_FILTERS : filterDraft(board, page);
    clearPending.current = false;
    setDialog({ kind: 'filter', draft });
  }

  return <>
    <ToolbarActions preset={preset} scopeControls={props.scopeControls} viewControls={viewControls} filterButton={filterButton} toolsButton={toolsButton} isFilterOpen={draft !== null}
      chasePage={chasePage} isChaseOpen={isChaseOpen} onFilter={openFilters}
      onChase={() => {
        chasePage?.onCancelCopy?.();
        setDialog({ kind: 'chase' });
      }} />
    <WorkspaceFilterDialog {...props} draft={draft} onClose={close} onChange={(next) => setDialog({ kind: 'filter', draft: next })} />
    {chasePage === undefined ? null : <ChaseCopyDialog page={chasePage} open={isChaseOpen} onClose={close} />}
    <AppliedFilters page={page} selection={selection} onClear={() => {
      // Reopening can happen before the router renders the cleared search parameters.
      clearPending.current = true;
      const target = toolsButton.current?.offsetWidth ? toolsButton.current : filterButton.current;
      target?.focus({ preventScroll: true });
    }} />
    {!isChaseOpen && copyNotice ? <Typography.Text role="status">{copyNotice}</Typography.Text> : null}
  </>;
}

type PriorityPreset = { readonly isActive: boolean; readonly select: (active: boolean) => void };

function priorityPreset({ board, page, onApplyFilters }: ActionToolbarProps): PriorityPreset | null {
  if (page?.inbox !== 'today' || page.calendar !== undefined || board.group === 'kanban' || onApplyFilters === undefined) return null;
  if (page.work !== undefined || page.sort.kind !== 'urgency') return null;
  const isActive = isPriorityBatchSelection(page.reasons);
  if (page.reasons.length > 0 && !isActive) return null;
  return { isActive, select: (active) => onApplyFilters({ ...CLEARED_FILTERS, reasons: active ? PRIORITY_BATCH_REASONS : [] }) };
}

function ToolbarActions(props: Pick<ActionToolbarProps, 'viewControls' | 'scopeControls'> & {
  readonly preset: PriorityPreset | null;
  readonly filterButton: Ref<HTMLButtonElement>;
  readonly toolsButton: RefObject<HTMLButtonElement | null>;
  readonly chasePage: ActionPageControls | undefined;
  readonly isFilterOpen: boolean;
  readonly isChaseOpen: boolean;
  readonly onFilter: () => void;
  readonly onChase: () => void;
}) {
  return <Flex className="today-touch today-toolbar" align="center" gap="small" wrap>
    <Flex className="today-toolbar-context" align="center" gap="small" wrap>
      {props.scopeControls}
      {props.viewControls}
    </Flex>
    <Flex className="today-toolbar-main" align="center" gap="small" wrap>
      {props.preset === null ? null : <ViewSwitch className="today-priority-switch" aria-label="批次优先范围"
        options={[{ value: 'all', label: '全部' }, { value: 'priority', label: '优先', tooltip: '逾期或今日应到的批次' }]}
        value={props.preset.isActive ? 'priority' : 'all'} onChange={(value) => props.preset?.select(value === 'priority')} />}
      <CompactActionMenu preset={props.preset} trigger={props.toolsButton} canChase={props.chasePage !== undefined} onFilter={props.onFilter} onChase={props.onChase} />
      <Flex className="today-toolbar-buttons" gap="small" wrap>
        <Button className="today-toolbar-filter" ref={props.filterButton} icon={<FilterOutlined aria-hidden />}
          aria-label="筛选待办" aria-haspopup="dialog" aria-expanded={props.isFilterOpen} onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            props.onFilter();
          }}>筛选待办</Button>
        {props.chasePage === undefined ? null : <Button className="today-toolbar-chase" icon={<CopyOutlined aria-hidden />}
          aria-label="按工厂复制催单" aria-haspopup="dialog" aria-expanded={props.isChaseOpen} onClick={(event) => {
            event.currentTarget.focus({ preventScroll: true });
            props.onChase();
          }}>按工厂复制催单</Button>}
      </Flex>
    </Flex>
  </Flex>;
}

function CompactActionMenu({ trigger, canChase, onFilter, onChase, preset }: {
  readonly trigger: RefObject<HTMLButtonElement | null>; readonly canChase: boolean; readonly preset: PriorityPreset | null;
  readonly onFilter: () => void; readonly onChase: () => void;
}) {
  const items = [{ key: 'filter', icon: <FilterOutlined aria-hidden />, label: '筛选待办' }];
  if (preset) items.unshift({ key: 'priority', icon: <FilterOutlined aria-hidden />, label: preset.isActive ? '查看全部待办' : '只看优先批次' });
  if (canChase) items.push({ key: 'chase', icon: <CopyOutlined aria-hidden />, label: '按工厂复制催单' });
  return <WorkspaceMenu trigger={trigger} button={{ className: 'today-toolbar-compact', 'aria-label': '待办操作' }}
    menu={{ items, onClick: ({ key }) => {
      if (key === 'priority' && preset) preset.select(!preset.isActive);
      if (key === 'filter') onFilter();
      if (key === 'chase') onChase();
    } }}>操作</WorkspaceMenu>;
}

function WorkspaceFilterDialog({ draft, onClose, onChange, onApplyFilters, ...props }: ActionToolbarProps & {
  readonly draft: WorkspaceFilterSelection | null;
  readonly onClose: () => void;
  readonly onChange: (selection: WorkspaceFilterSelection) => void;
}) {
  const applyButton = useRef<HTMLButtonElement>(null);
  const [afterClose, setAfterClose] = useState<(() => void) | null>(null);
  const closeAndJump: CloseAndJump = (jump) => {
    setAfterClose(() => jump);
    onClose();
  };

  function apply() {
    if (draft === null) return;
    onApplyFilters?.(draft);
    const work = draft.work;
    if (work !== props.page?.work && (work === 'factory_chase' || work === 'internal_note')) {
      closeAndJump(() => focusSection('today-chase'));
    } else {
      onClose();
    }
  }

  return <Modal title="筛选待办" open={draft !== null} centered
    closable={{ 'aria-label': '关闭筛选待办' }} destroyOnHidden mask={{ closable: false }} styles={actionDialogStyles}
    focusable={{ trap: true, focusTriggerAfterClose: afterClose === null }} onCancel={onClose}
    afterOpenChange={(open) => { if (open) applyButton.current?.focus({ preventScroll: true }); }}
    afterClose={() => {
      setAfterClose(null);
      afterClose?.();
    }}
    footer={<Flex justify="end" gap="small" wrap>
      <Button style={actionDialogTarget} onClick={onClose}>取消</Button>
      <Button type="primary" ref={applyButton} style={actionDialogTarget} onClick={apply}>应用筛选</Button>
    </Flex>}>
    {draft === null ? null : <ActionOptions {...props} draft={draft} onJump={closeAndJump} onChange={onChange} />}
  </Modal>;
}

function filterDraft(board: TodayBoard, page: ActionPageControls | undefined): WorkspaceFilterSelection {
  return {
    reasons: page?.reasons ?? board.chips.filter((chip) => chip.isSelected).map((chip) => chip.code),
    work: page?.work,
    sort: page?.sort ?? { kind: 'urgency' },
    group: undefined,
  };
}

function appliedFilterLabels({ chips, page, preset }: {
  readonly chips: readonly ReasonChip[]; readonly page: ActionPageControls | undefined; readonly preset: PriorityPreset | null;
}): readonly string[] {
  if (preset?.isActive) return ['逾期或今日应到的批次'];
  const selection = chips.filter((chip) => chip.isSelected).map((chip) => chip.label);
  // The ordinary list result already names the work type beside its matched batch count.
  if (page?.work !== undefined && (page.calendar !== undefined || page.sort.kind === 'bulk' || !page.isSettled)) {
    selection.unshift(workFilterLabels[page.work]);
  }
  if (page?.sort.kind === 'bulk') selection.push(`大批优先（${page.sort.unit}）`);
  return selection;
}

function AppliedFilters({ page, selection, onClear }: {
  readonly page: ActionPageControls | undefined;
  readonly selection: readonly string[];
  readonly onClear: () => void;
}) {
  if (selection.length === 0 && page?.isFiltered !== true) return null;
  return <Flex className="today-touch" align="center" gap="small" wrap>
    {selection.length === 0 ? null : <Typography.Text type="secondary">当前筛选 · {selection.join('、')}</Typography.Text>}
    {page?.isFiltered === true && page.calendar === undefined ? <ActionResult page={page} /> : null}
    {page?.isFiltered !== true ? null : <Button size="small" type="link" onClick={() => {
      onClear();
      page.onWork();
    }}>清除筛选</Button>}
  </Flex>;
}

type FilterOptionsProps = Pick<ActionToolbarProps, 'board' | 'page' | 'calendar' | 'utilityLinks'> & {
  readonly draft: WorkspaceFilterSelection;
  readonly onChange: (selection: WorkspaceFilterSelection) => void;
};

function ActionOptions({ board, page, calendar, utilityLinks, draft, onJump, onChange }: FilterOptionsProps & {
  readonly onJump: CloseAndJump;
}) {
  const shortcuts = utilityLinks?.(onJump);
  return <Flex className="today-touch" vertical gap="middle">
    <Typography.Text type="secondary">选好条件后，工作台只显示匹配的待办。</Typography.Text>
    {page?.inbox === 'today' ? <WorkOptions page={page} work={draft.work} onWork={(work) => onChange({ ...draft, work })} /> : null}
    <ReasonOptions chips={board.chips} selected={draft.reasons} onToggle={(code) => onChange({
      ...draft,
      reasons: draft.reasons.includes(code) ? draft.reasons.filter((reason) => reason !== code) : [...draft.reasons, code],
    })} />
    <DisplayOptions board={board} page={page} calendar={calendar} draft={draft} onChange={onChange} />
    {shortcuts == null ? null : <Flex vertical gap="small">
      <Typography.Text strong>跳到待办</Typography.Text>
      <Flex role="group" aria-label="跳到待办" gap="small" wrap>{shortcuts}</Flex>
    </Flex>}
  </Flex>;
}

function DisplayOptions({ board, page, calendar, draft, onChange }: Omit<FilterOptionsProps, 'utilityLinks'>) {
  const canGroupList = calendar === undefined && board.group !== 'kanban' && draft.sort.kind !== 'bulk';
  const canSort = page !== undefined && page.inbox !== 'scheduled';
  if (!canSort && !canGroupList) return null;
  return <Flex role="group" aria-label="显示方式" vertical gap="small">
    <Typography.Text strong>显示方式</Typography.Text>
    {canSort ? <SortControls sort={draft.sort} units={page.paging.units} onSort={(sort) => onChange({ ...draft, sort })} /> : null}
    {canGroupList ? <Flex align="center" gap="small" wrap>
      <Typography.Text>清单分组</Typography.Text>
      <TodayGrouping label="清单分组" modes={LIST_GROUPS} group={draft.group ?? board.group} onGroup={(group) => onChange({ ...draft, group })} />
    </Flex> : null}
  </Flex>;
}

function WorkOptions({ page, work, onWork }: {
  readonly page: ActionPageControls;
  readonly work: TodayWorkFilter | undefined;
  readonly onWork: (work: TodayWorkFilter | undefined) => void;
}) {
  const scopes: readonly { readonly key: TodayWorkFilter; readonly count: number | undefined }[] = [
    { key: 'factory_chase', count: page.paging.chaseCounts?.all },
    { key: 'internal_note', count: page.paging.internalNoteCount },
  ];
  return <Flex role="group" aria-label="待办类型" vertical gap="small">
    <Typography.Text strong>待办类型</Typography.Text>
    <Flex align="center" gap="small" wrap>
      {scopes.filter(({ key, count }) => (count ?? 0) > 0 || work === key || page.work === key).map(({ key, count }) => (
        <FilterOption key={key} selected={work === key} onClick={() => onWork(work === key ? undefined : key)}>
          {workFilterLabels[key]}{count === undefined ? '' : ` ${count} 批`}
        </FilterOption>
      ))}
      <FilterOption selected={work === 'all_unshipped'} onClick={() => onWork(work === 'all_unshipped' ? undefined : 'all_unshipped')}>
        {workFilterLabels.all_unshipped}
      </FilterOption>
    </Flex>
  </Flex>;
}

function ReasonOptions({ chips, selected, onToggle }: {
  readonly chips: readonly ReasonChip[];
  readonly selected: readonly string[];
  readonly onToggle: (code: string) => void;
}) {
  if (chips.length === 0) return null;
  return <Flex role="group" aria-label="待办原因" vertical gap="small">
    <Typography.Text strong>待办原因</Typography.Text>
    <Flex align="center" gap="small" wrap>
      {chips.map((chip) => <FilterOption key={chip.code} selected={selected.includes(chip.code)} onClick={() => onToggle(chip.code)}>
        {chip.label} {chip.count}
      </FilterOption>)}
    </Flex>
  </Flex>;
}

function FilterOption({ selected, onClick, children }: {
  readonly selected: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return <Button size="small" aria-pressed={selected} style={actionDialogTarget}
    color={selected ? 'primary' : 'default'} variant={selected ? 'filled' : 'outlined'} onClick={onClick}>{children}</Button>;
}
