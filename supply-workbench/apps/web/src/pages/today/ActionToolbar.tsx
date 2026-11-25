import { Button, Card, Flex, Tag, Typography } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
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
  const { board, page, utilityLinks, viewControls } = props;
  const [isOpen, setOpen] = useState(false);
  const filterId = useId();
  const filterButton = useRef<HTMLButtonElement>(null);
  const selection = board.chips.filter((chip) => chip.isSelected).map((chip) => chip.label);
  if (page?.work !== undefined) selection.unshift(workFilterLabels[page.work]);
  if (page?.sort.kind === 'bulk') selection.push(`大批优先（${page.sort.unit}）`);
  const label = page?.inbox === 'today' ? '筛选与复制催单' : '筛选';
  return (
    <>
      <Flex className="today-touch" align="center" gap="small" wrap>
        <Flex align="center" gap="small" wrap>
          {viewControls}
          <Button ref={filterButton} icon={<FilterOutlined aria-hidden />} aria-label={label} aria-expanded={isOpen}
            aria-controls={filterId} onClick={() => setOpen(!isOpen)}>
            <span>筛选{page?.inbox === 'today' ? <span className="today-filter-copy-label">与复制催单</span> : null}</span>
          </Button>
        </Flex>
        <ActionControls page={page} utilityLinks={utilityLinks} />
        <ProcurementCutoff />
      </Flex>
      <div id={filterId} hidden={!isOpen}>
        {isOpen ? <ActionOptions {...props} /> : null}
      </div>
      <AppliedFilters page={page} selection={selection} onClear={() => filterButton.current?.focus({ preventScroll: true })} />
    </>
  );
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
      <ActionControls page={page} utilityLinks={utilityLinks} isNarrow />
      {canGroupList ? <Flex className="today-touch" align="center" gap="small" wrap>
        <Typography.Text>清单分组</Typography.Text>
        <TodayGrouping label="清单分组" modes={LIST_GROUPS} group={board.group} onGroup={onGroup} />
      </Flex> : null}
      <search className="today-touch" aria-label="工作台筛选">
        <ReasonChips chips={board.chips} onToggle={onToggleReason} />
      </search>
      {page?.inbox === 'today' ? <ChaseOptions page={page} /> : null}
    </Flex>
  </Card>;
}

function ChaseOptions({ page }: { readonly page: ActionPageControls }) {
  const isAllUnshipped = page.work === 'all_unshipped';
  return <>
    <Flex className="today-touch" align="center" gap="small" wrap>
      {isAllUnshipped ? null : <BatchLinks page={page} />}
      <Button size="small" aria-pressed={isAllUnshipped}
        onClick={() => page.onWork(isAllUnshipped ? undefined : 'all_unshipped')}>{workFilterLabels.all_unshipped}</Button>
    </Flex>
    <ChaseControls page={page} />
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
