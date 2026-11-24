import { Button, Descriptions, Drawer, Empty, Flex, Table, Tag, Typography, type TableColumnType } from 'antd';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { StuckDashboard, StuckItem } from '@sw/contracts';
import { batchStatusLabel } from '@sw/domain';
import { useCan } from '../../shared/actor.js';
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
  drawerWidth,
  space,
  text,
  topBar,
} from '../../theme/tokens.js';
import { useShellViewport } from '../../features/shell/index.js';
import { MetricStrip, StackedBarChart, type MetricItem } from '../../shared/ui/analytics.js';
import { mobileStuckColumns } from './stuck-mobile.js';
import { CAUSE_LABEL, CauseFilter } from './cause-filter.js';

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
  const [selected, setSelected] = useState<{ readonly batchId: string; readonly open: boolean }>();
  const listRef = useRef<HTMLElement>(null);
  const stuck = stuckView({ items: data.items, distribution: data.distribution, stage: query.stage, bucket: query.bucket });
  const item = data.items.find((candidate) => candidate.batchId === selected?.batchId);
  const row = stuck.rows.find((candidate) => candidate.batchId === selected?.batchId);
  return (
    <Flex vertical gap={space[3]}>
      <Typography.Text type="secondary">截至今日（{data.asOf}），按所选线别统计批次</Typography.Text>
      <CardRow kpis={data.kpis} filters={query} onSearch={onSearch} />
      <CauseFilter counts={data.causeCounts} from={query.from} to={query.to} cause={query.cause} onSearch={onSearch} />
      <section ref={listRef} aria-label="卡点明细" tabIndex={-1} style={{ scrollMarginTop: topBar + space[2] }}>
        <Flex vertical gap={space[2]}>
          <StuckFilter filters={query} onSearch={onSearch} />
          <Typography.Title level={2} style={{ margin: 0 }}>
            卡点清单{isUpdating ? '' : `（${formatQuantity(data.total)} 批）`}
          </Typography.Title>
          {data.total === 0 && !isUpdating ? <Empty description="当前筛选没有卡点" /> : (
            <StuckTable rows={isUpdating ? [] : stuck.rows} page={data.page} pageSize={data.pageSize}
              total={data.total} isUpdating={isUpdating} now={props.now} onSearch={onSearch}
              onOpen={(batch) => setSelected({ batchId: batch.batchId, open: true })} />
          )}
        </Flex>
      </section>
      <DwellChart dwell={stuck.dwell} onSearch={(patch) => { onSearch(patch); listRef.current?.focus(); }} />
      {item === undefined || row === undefined || selected === undefined ? null :
        <StuckDetails item={item} row={row} now={props.now} isOpen={selected.open}
          onClose={() => setSelected({ ...selected, open: false })} onHidden={() => setSelected(undefined)} />}
    </Flex>
  );
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

function StuckFilter(props: { readonly filters: StuckFilters; readonly onSearch: SearchHandler }) {
  if (sameFilters(props.filters, CLEAR_FILTERS)) return null;
  return (
    <Flex align="center" wrap gap={space[1]}>
      <Tag>当前筛选 {filterText(props.filters)}</Tag>
      <Button type="link" onClick={() => props.onSearch(CLEAR_FILTERS)}>显示全部</Button>
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
  readonly now: Date;
  readonly onSearch: SearchHandler;
  readonly onOpen: (row: StuckTableRow) => void;
}) {
  const isPhone = useShellViewport().band === 'phone';
  const isNarrowPhone = isPhone && window.innerWidth <= 340;
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
      columns={stuckColumns({ now: props.now, isPhone, isNarrowPhone, onOpen: props.onOpen })}
      dataSource={[...props.rows]}
      {...(isPhone ? {} : { scroll: { x: 'max-content' as const }, sticky: { offsetHeader: topBar } })}
    />
  );
}

function stuckColumns(input: {
  readonly now: Date; readonly isPhone: boolean; readonly isNarrowPhone: boolean; readonly onOpen: (row: StuckTableRow) => void;
}): TableColumnType<StuckTableRow>[] {
  const openBatch = (row: StuckTableRow) => {
    const batch = row.batchSeq === undefined ? '' : `第 ${row.batchSeq} 批`;
    const label = ['查看卡点明细', row.po === EM_DASH ? row.name : row.po, batch].filter(Boolean).join(' ');
    return (
      <Button type="link" size="small" aria-label={label}
        style={{ maxWidth: '100%', paddingInline: 0, height: 'auto', minHeight: 24, alignItems: 'start',
          flexDirection: input.isPhone ? 'column' : 'row', gap: input.isPhone ? 0 : space[0] }}
        onClick={() => input.onOpen(row)}>
        <Typography.Text ellipsis style={{ color: 'inherit', maxWidth: '100%' }}>{row.po === EM_DASH ? '查看' : row.po}</Typography.Text>
        {batch === '' ? null : <Typography.Text type="secondary" style={{ flexShrink: 0 }}>{batch}</Typography.Text>}
      </Button>
    );
  };
  if (input.isPhone) return mobileStuckColumns(input.isNarrowPhone, openBatch);
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

function StuckDetails({ item, row, now, isOpen, onClose, onHidden }: {
  readonly item: StuckItem; readonly row: StuckTableRow; readonly now: Date; readonly isOpen: boolean;
  readonly onClose: () => void; readonly onHidden: () => void;
}) {
  const canReadLine = useCan('data.read');
  const lineHref = canReadLine && item.orderLineId !== undefined
    ? `/lines/${encodeURIComponent(item.orderLineId)}?focusBatch=${encodeURIComponent(item.batchId)}` : undefined;
  const signals = stuckSignals(item);
  return <Drawer open={isOpen} title="卡点批次明细" size={`min(${drawerWidth}px, 100vw)`} onClose={onClose}
    afterOpenChange={(open) => { if (!open) onHidden(); }}
    focusable={{ trap: true, focusTriggerAfterClose: true }}>
    <Descriptions size="small" column={1} items={[
      { key: 'po', label: '采购单', children: row.po },
      { key: 'batch', label: '要货批次', children: row.batchSeq === undefined ? row.batchId : `第 ${row.batchSeq} 批` },
      ...(lineHref === undefined ? [] : [{ key: 'line', label: '订单行', children: <Link to={lineHref}>打开订单行</Link> }]),
      { key: 'name', label: '品名', children: row.name },
      { key: 'stage', label: '阶段', children: `${row.stageLabel} · 停留 ${row.daysInStage} 天` },
      { key: 'waiting', label: '等待方', children: row.waiting },
      { key: 'owner', label: '负责人', children: row.owner },
      { key: 'confirmed', label: '确认到货', children: row.confirmed === EM_DASH ? EM_DASH : formatTableDate({ iso: row.confirmed, now }) },
      { key: 'signals', label: '关联与异常', children: signals.length === 0 ? EM_DASH : signals.map((label) => <Tag key={label}>{label}</Tag>) },
    ]} />
  </Drawer>;
}

function stuckSignals(item: StuckItem): string[] {
  return [
    !item.factoryLinked && CAUSE_LABEL.missing_factory,
    item.factoryUnlinked && CAUSE_LABEL.factory_demand_unlinked,
    item.exceptionOpen && CAUSE_LABEL.exception_open,
    item.supplierAliasPending && CAUSE_LABEL.supplier_pending,
    item.bomMissing && CAUSE_LABEL.bom_missing,
  ].filter((label) => label !== false);
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
