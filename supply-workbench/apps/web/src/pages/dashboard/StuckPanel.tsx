import { Button, Collapse, Empty, Flex, Table, Tag, Typography, type TableColumnType } from 'antd';
import { useRef, type ReactNode, type Ref } from 'react';
import type { StuckDashboard } from '@sw/contracts';
import { batchStatusLabel } from '@sw/domain';
import { formatQuantity, formatTableDate } from '../../shared/ui/format.js';
import {
  EM_DASH,
  STUCK_BUCKETS,
  stuckView,
  type DashboardPatch,
  type StuckBucket,
  type DashboardQuery,
  type StuckFilters,
  type StuckTableRow,
  type StuckView,
} from '../../features/performance/index.js';
import {
  dwellColor,
  space,
  text,
  topBar,
} from '../../theme/tokens.js';
import { useShellViewport } from '../../features/shell/index.js';
import { MetricStrip, StackedBarChart, type MetricItem } from '../../shared/ui/analytics.js';
import { StuckSelection, stuckTriggerId, useStuckSelection } from './StuckSelection.js';
import { mobileStuckColumns } from './stuck-mobile.js';
import { CAUSE_LABEL, CauseFilter, SourceLinks } from './cause-filter.js';

type SearchHandler = (patch: DashboardPatch) => void;
type TextKey = 'stageLabel' | 'name' | 'waiting' | 'owner';

const CLEAR_FILTERS: StuckFilters = { stage: null, bucket: null, cause: null, card: null };

const CARDS = [
  { key: 'overdue', label: '逾期', tone: 'danger', filters: { ...CLEAR_FILTERS, card: 'overdue' } },
  { key: 'awaitingDate', label: '待确认日期', tone: 'warning', filters: { ...CLEAR_FILTERS, stage: 'awaiting_date' } },
  { key: 'openBatches', label: '开放批次', tone: 'neutral', filters: CLEAR_FILTERS },
  { key: 'shippedNotReceived', label: '已发待收', tone: 'info', filters: { ...CLEAR_FILTERS, stage: 'shipped' } },
] satisfies readonly { key: keyof StuckDashboard['kpis']; label: string; tone: MetricItem['tone']; filters: StuckFilters }[];

export function StuckPanel(props: {
  readonly data: StuckDashboard;
  readonly query: DashboardQuery;
  readonly isUpdating: boolean;
  readonly onSearch: SearchHandler;
  readonly now: Date;
}) {
  const { data, query, onSearch, isUpdating } = props;
  const isPhone = useShellViewport().band === 'phone';
  const listRef = useRef<HTMLElement>(null);
  const { batchId, select } = useStuckSelection(listRef);
  const stuck = stuckView({ items: data.items, distribution: data.distribution, stage: query.stage, bucket: query.bucket });
  const filterList = (patch: DashboardPatch) => {
    onSearch(patch);
    listRef.current?.focus();
  };
  const filters = <Flex vertical gap={space[2]}>
    <CardRow kpis={data.kpis} filters={query} onSearch={filterList} />
    <CauseFilter counts={data.causeCounts} cause={query.cause} onSearch={filterList} />
  </Flex>;
  const selection = <StuckSelection batchId={batchId} data={data} rows={stuck.rows} now={props.now}
    isUpdating={isUpdating} listRef={listRef} onClose={() => select(null)} />;
  return (
    <Flex vertical gap={space[3]}>
      {isPhone ? <Collapse size="small" items={[{ key: 'filters', label: '卡点指标与原因筛选', children: filters }]} /> : filters}
      <StuckList ref={listRef} data={data} query={query} rows={stuck.rows} isUpdating={isUpdating} now={props.now} isPhone={isPhone}
        selection={selection} onSearch={onSearch} onClear={() => filterList(CLEAR_FILTERS)}
        onOpen={(batch) => select(batch.batchId, data.page === query.page ? undefined : data.page)} />
      <DwellChart dwell={stuck.dwell} onSearch={filterList} />
      <SourceLinks key={data.asOf} asOf={data.asOf} />
    </Flex>
  );
}

function StuckList({ ref, data, query, rows, isUpdating, now, isPhone, selection, onSearch, onClear, onOpen }: {
  readonly ref: Ref<HTMLElement>;
  readonly data: StuckDashboard;
  readonly query: StuckFilters;
  readonly rows: readonly StuckTableRow[];
  readonly isUpdating: boolean;
  readonly now: Date;
  readonly isPhone: boolean;
  readonly selection: ReactNode;
  readonly onSearch: SearchHandler;
  readonly onClear: () => void;
  readonly onOpen: (row: StuckTableRow) => void;
}) {
  return <section ref={ref} aria-label="卡点明细" tabIndex={-1} style={{ scrollMarginTop: topBar + space[2] }}>
    <Flex vertical gap={space[2]}>
      <Typography.Title level={2} style={{ margin: 0 }}>
        卡点清单{isUpdating ? '' : `（${formatQuantity(data.total)} 批）`}
      </Typography.Title>
      {selection}
      <StuckFilter filters={query} onClear={onClear} />
      {data.total === 0 && !isUpdating ? <Empty description="当前筛选没有卡点" /> : (
        <StuckTable rows={isUpdating ? [] : rows} page={data.page} pageSize={data.pageSize}
          total={data.total} isUpdating={isUpdating} now={now} onSearch={onSearch} isPhone={isPhone} onOpen={onOpen} />
      )}
    </Flex>
  </section>;
}

function CardRow(props: {
  readonly kpis: StuckDashboard['kpis'];
  readonly filters: StuckFilters;
  readonly onSearch: SearchHandler;
}) {
  return <MetricStrip ariaLabel="卡点批次指标" items={CARDS.map(({ key, label, tone, filters }) => ({
    key, label, tone, value: props.kpis[key],
    action: { isActive: sameFilters(filters, props.filters), select: () => props.onSearch({ ...filters, page: 1 }) },
  }))} />;
}

function sameFilters(left: StuckFilters, right: StuckFilters): boolean {
  return left.stage === right.stage && left.bucket === right.bucket && left.cause === right.cause && left.card === right.card;
}

function DwellChart(props: {
  readonly dwell: StuckView['dwell'];
  readonly onSearch: SearchHandler;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <Typography.Title level={2} style={{ margin: 0 }}>
        各阶段卡了几天
      </Typography.Title>
      <Typography.Text type="secondary">每条横条表示该阶段内部的批次占比。选择天数档可筛选卡点清单。</Typography.Text>
      <StackedBarChart
        ariaLabel="各批次阶段停留天数分布"
        scale="composition"
        showValues
        rows={props.dwell.map((row) => ({
          key: row.stage,
          label: row.label,
          segments: row.blocks.map((block) => ({
            key: block.bucket,
            label: `${block.bucket} 天`,
            value: block.count,
            fill: dwellColor[block.bucket],
            isActive: block.isActive,
          })),
          onSelect: (bucket) => { const selected = bucketOf(bucket); if (selected !== undefined) props.onSearch({ ...CLEAR_FILTERS, stage: row.stage, bucket: selected, page: 1 }); },
        }))}
      />
    </div>
  );
}

function bucketOf(value: string): StuckBucket | undefined {
  return STUCK_BUCKETS.find((bucket) => bucket === value);
}

function StuckFilter(props: { readonly filters: StuckFilters; readonly onClear: () => void }) {
  if (sameFilters(props.filters, CLEAR_FILTERS)) return null;
  return (
    <Flex align="center" wrap gap={space[1]}>
      <Tag>当前筛选 {filterText(props.filters)}</Tag>
      <Button type="link" onClick={props.onClear}>显示全部</Button>
    </Flex>
  );
}

function filterText(input: StuckFilters): string {
  const stage = input.stage === null ? '' : batchStatusLabel(input.stage);
  const bucket = input.bucket === null ? '' : `${input.bucket} 天`;
  const cause = input.cause === null ? '' : CAUSE_LABEL[input.cause];
  return [input.card === 'overdue' ? '逾期' : '', stage, bucket, cause].filter((part) => part !== '').join(' · ');
}

function StuckTable(props: {
  readonly rows: readonly StuckTableRow[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly isUpdating: boolean;
  readonly isPhone: boolean;
  readonly now: Date;
  readonly onSearch: SearchHandler;
  readonly onOpen: (row: StuckTableRow) => void;
}) {
  const { isPhone } = props;
  return (
    <Table<StuckTableRow>
      size="small"
      loading={props.isUpdating}
      pagination={{
        current: props.page,
        pageSize: props.pageSize,
        total: props.total,
        hideOnSinglePage: true,
        showSizeChanger: false,
        disabled: props.isUpdating,
        onChange: (page) => props.onSearch({ page }),
      }}
      rowKey="batchId"
      columns={stuckColumns({ now: props.now, isPhone, onOpen: props.onOpen })}
      dataSource={[...props.rows]}
      {...(isPhone ? {} : { scroll: { x: 'max-content' as const }, sticky: { offsetHeader: topBar } })}
    />
  );
}

function stuckColumns(input: {
  readonly now: Date; readonly isPhone: boolean; readonly onOpen: (row: StuckTableRow) => void;
}): TableColumnType<StuckTableRow>[] {
  const openBatch = (row: StuckTableRow) => {
    const batch = row.batchSeq === undefined ? '' : `第 ${row.batchSeq} 批`;
    const label = ['查看卡点明细', row.po === EM_DASH ? row.name : row.po, batch].filter(Boolean).join(' ');
    return (
      <Button id={stuckTriggerId(row.batchId)} type="link" size="small" aria-label={label} aria-haspopup="dialog"
        style={{ maxWidth: '100%', paddingInline: 0, height: 'auto', minHeight: input.isPhone ? 44 : 24, alignItems: 'start',
          justifyContent: 'center', textAlign: 'start', whiteSpace: 'normal', flexDirection: input.isPhone ? 'column' : 'row', gap: input.isPhone ? 0 : space[0] }}
        onClick={() => input.onOpen(row)}>
        <Typography.Text style={{ color: 'inherit', maxWidth: '100%', overflowWrap: 'anywhere' }}>{row.po === EM_DASH ? '查看' : row.po}</Typography.Text>
        {batch === '' ? null : <Typography.Text type="secondary" style={{ flexShrink: 0 }}>{batch}</Typography.Text>}
      </Button>
    );
  };
  if (input.isPhone) return mobileStuckColumns({ now: input.now, openBatch });
  return [
    textColumn('阶段', 'stageLabel'),
    {
      title: '卡了',
      dataIndex: 'daysInStage',
      align: 'right',
      render: (value: number) => (
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      ),
    },
    { title: '单号', rowScope: 'row', render: (_value, row) => openBatch(row) },
    textColumn('品名', 'name'),
    textColumn('等待方', 'waiting'),
    textColumn('负责人', 'owner'),
    {
      title: '确认到货',
      dataIndex: 'confirmed',
      render: (value: string) => (
        <DashText value={value === EM_DASH ? value : formatTableDate({ iso: value, now: input.now })} />
      ),
    },
  ];
}

function textColumn(title: string, dataIndex: TextKey): TableColumnType<StuckTableRow> {
  return { title, dataIndex, render: (value: string) => <DashText value={value} /> };
}

function DashText(props: { readonly value: string }) {
  return (
    <span style={{ color: props.value === EM_DASH ? text.tertiary : text.primary }}>
      {props.value}
    </span>
  );
}
