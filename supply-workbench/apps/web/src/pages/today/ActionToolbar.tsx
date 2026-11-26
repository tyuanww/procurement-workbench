import { Button, Card, Flex, Tag, Typography } from 'antd';
import { CopyOutlined, FilterOutlined } from '@ant-design/icons';
import { useId, useRef, useState, type ReactNode } from 'react';
import type { GroupMode, ReasonChip, TodayBoard } from '../../features/today/index.js';
import { ProcurementCutoff } from '../../shared/ui/procurement-cutoff.js';
import { ActionControls, BatchLinks, ChaseControls, workFilterLabels, type ActionPageControls } from './ActionControls.js';
import { TodayGrouping } from './TodayGroup.js';

export type ActionToolbarProps = {
  readonly board: TodayBoard;
  readonly page: ActionPageControls | undefined;
  readonly viewControls?: ReactNode;
  readonly utilityLinks?: ReactNode;
  readonly calendar?: ReactNode;
  readonly onToggleReason: (code: string) => void;
  readonly onGroup: (group: GroupMode) => void;
};

const LIST_GROUPS: readonly { readonly id: GroupMode; readonly label: string }[] = [
  { id: 'priority', label: '不分组' },
  { id: 'waiting', label: '等待方' },
  { id: 'reason', label: '原因' },
  { id: 'date', label: '日期' },
];

export function ActionToolbar(props: ActionToolbarProps) {
  const { board, page, viewControls } = props;
  const [panel, setPanel] = useState<'filter' | 'chase' | null>(null);
  const filterId = useId();
  const chaseId = useId();
  const filterButton = useRef<HTMLButtonElement>(null);
  const selection = appliedFilterLabels(board.chips, page);
  const chasePage = page?.inbox === 'today' ? page : undefined;
  const isFilterOpen = panel === 'filter';
  const isChaseOpen = panel === 'chase';
  return (
    <>
      <Flex className="today-touch today-toolbar" align="center" gap="small" wrap>
        <Flex className="today-toolbar-main" align="center" gap="small" wrap>
          {viewControls}
          <Flex className="today-toolbar-buttons" gap="small">
            <Button className="today-toolbar-filter" ref={filterButton} icon={<FilterOutlined aria-hidden />} aria-expanded={isFilterOpen}
              aria-controls={filterId} onClick={() => setPanel(isFilterOpen ? null : 'filter')}>筛选</Button>
            {chasePage === undefined ? null : <Button className="today-toolbar-chase" icon={<CopyOutlined aria-hidden />}
              aria-expanded={isChaseOpen} aria-controls={chaseId} onClick={() => setPanel(isChaseOpen ? null : 'chase')}>按工厂催单</Button>}
          </Flex>
        </Flex>
        <ProcurementCutoff />
      </Flex>
      <div id={filterId} hidden={!isFilterOpen}>
        {isFilterOpen ? <ActionOptions {...props} /> : null}
      </div>
      {chasePage === undefined ? null : <div id={chaseId} hidden={!isChaseOpen}>
        {isChaseOpen ? <Card size="small" className="today-copy-panel" role="region" aria-label="工厂催单"><ChaseControls page={chasePage} /></Card> : null}
      </div>}
      <AppliedFilters page={page} selection={selection} onClear={() => filterButton.current?.focus({ preventScroll: true })} />
    </>
  );
}

function appliedFilterLabels(chips: readonly ReasonChip[], page: ActionPageControls | undefined): readonly string[] {
  const selection = chips.filter((chip) => chip.isSelected).map((chip) => chip.label);
  if (page?.work !== undefined) selection.unshift(workFilterLabels[page.work]);
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
    {page?.isFiltered !== true ? null : <Button size="small" type="link" onClick={() => {
      onClear();
      page.onWork();
    }}>清除筛选</Button>}
  </Flex>;
}

function ActionOptions({ board, page, onGroup, onToggleReason, calendar, utilityLinks }: ActionToolbarProps) {
  const canGroupList = calendar === undefined && board.group !== 'kanban' && page?.sort.kind !== 'bulk';
  return <Card size="small">
    <Flex vertical gap="small">
      <ActionControls page={page} utilityLinks={utilityLinks} />
      {canGroupList ? <Flex className="today-touch" align="center" gap="small" wrap>
        <Typography.Text>清单分组</Typography.Text>
        <TodayGrouping label="清单分组" modes={LIST_GROUPS} group={board.group} onGroup={onGroup} />
      </Flex> : null}
      <search className="today-touch" aria-label="工作台筛选">
        <ReasonChips chips={board.chips} onToggle={onToggleReason} />
      </search>
      {page?.inbox === 'today' ? <WorkOptions page={page} /> : null}
    </Flex>
  </Card>;
}

function WorkOptions({ page }: { readonly page: ActionPageControls }) {
  const isAllUnshipped = page.work === 'all_unshipped';
  return <Flex className="today-touch" align="center" gap="small" wrap>
    {isAllUnshipped ? null : <BatchLinks page={page} />}
    <Button size="small" aria-pressed={isAllUnshipped}
      onClick={() => page.onWork(isAllUnshipped ? undefined : 'all_unshipped')}>{workFilterLabels.all_unshipped}</Button>
  </Flex>;
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
