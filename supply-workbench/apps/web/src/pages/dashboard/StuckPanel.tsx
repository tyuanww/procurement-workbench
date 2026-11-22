import { Button, Empty, Statistic, Table, Typography, type TableColumnType } from 'antd';
import type { CSSProperties } from 'react';
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
  border,
  brand,
  dwellColor,
  fontSize,
  space,
  statusColor,
  text,
} from '../../theme/tokens.js';
import { useShellViewport } from '../../features/shell/index.js';
import { StackedBarChart } from '../../shared/ui/analytics.js';
import { mobileStuckColumns, mobileStuckRowDetails } from './stuck-mobile.js';
import { CAUSE_LABEL, CauseFilter } from './cause-filter.js';

type SearchHandler = (patch: DashboardPatch) => void;
type TextKey = 'stageLabel' | 'po' | 'name' | 'waiting' | 'owner' | 'confirmed';

const CLEAR_FILTERS: StuckFilters = { stage: null, bucket: null, cause: null, card: null };

const CARDS = [
  { key: 'overdue', label: '逾期', filters: { ...CLEAR_FILTERS, card: 'overdue' } },
  { key: 'awaitingDate', label: '待确认日期', filters: { ...CLEAR_FILTERS, stage: 'awaiting_date' } },
  { key: 'openBatches', label: '开放批次', filters: CLEAR_FILTERS },
  { key: 'shippedNotReceived', label: '已发待收', filters: { ...CLEAR_FILTERS, stage: 'shipped' } },
] satisfies readonly { key: keyof StuckDashboard['kpis']; label: string; filters: StuckFilters }[];

const metricStyle: CSSProperties = {
  fontSize: fontSize.metric,
  color: text.primary,
  fontVariantNumeric: 'tabular-nums',
};
const metricBox: CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderBottom: `1px solid ${border}`,
  borderRadius: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'flex-start',
  height: 'auto',
  minHeight: 72,
  lineHeight: 'normal',
  padding: space[2],
  minWidth: 140,
  flex: '1 1 140px',
  transition: 'background-color 160ms ease-out, border-color 160ms ease-out',
};

export function StuckPanel(props: {
  readonly data: StuckDashboard;
  readonly query: DashboardQuery;
  readonly isUpdating: boolean;
  readonly onSearch: SearchHandler;
  readonly now: Date;
}) {
  const { data, query, onSearch, isUpdating } = props;
  const stuck = stuckView({ items: data.items, distribution: data.distribution, stage: query.stage, bucket: query.bucket });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <Typography.Text type="secondary">截至今日（{data.asOf}），按所选线别统计</Typography.Text>
      <CardRow kpis={data.kpis} filters={query} onSearch={onSearch} />
      <CauseFilter counts={data.causeCounts} from={query.from} to={query.to} cause={query.cause} onSearch={onSearch} />
      <DwellChart dwell={stuck.dwell} onSearch={onSearch} />
      <StuckFilter filters={query} onSearch={onSearch} />
      <Typography.Title level={2} style={{ margin: 0 }}>
        卡点清单{isUpdating ? '' : `（${formatQuantity(data.total)} 批）`}
      </Typography.Title>
      {data.total === 0 && !isUpdating ? (
        <Empty description="当前筛选没有卡点" />
      ) : (
        <StuckTable rows={isUpdating ? [] : stuck.rows} page={data.page} pageSize={data.pageSize}
          total={data.total} isUpdating={isUpdating} now={props.now} onSearch={onSearch} />
      )}
    </div>
  );
}

function CardRow(props: {
  readonly kpis: StuckDashboard['kpis'];
  readonly filters: StuckFilters;
  readonly onSearch: SearchHandler;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
      {CARDS.map((card) => {
        const isActive = sameFilters(card.filters, props.filters);
        return (
          <Button
            key={card.key}
            type="text"
            aria-pressed={isActive}
            onClick={() => props.onSearch({ ...card.filters, page: 1 })}
            style={{
              ...metricBox,
              textAlign: 'left',
              cursor: 'pointer',
              borderTop: metricAccent(card.key),
              borderBottomColor: isActive ? brand[600] : border,
            }}
          >
            <Statistic title={card.label} value={props.kpis[card.key]} styles={{ content: metricStyle }} />
          </Button>
        );
      })}
    </div>
  );
}

function metricAccent(key: keyof StuckDashboard['kpis']): string {
  if (key === 'overdue') return `2px solid ${statusColor.danger.border}`;
  if (key === 'awaitingDate') return `2px solid ${statusColor.warning.border}`;
  return '2px solid transparent';
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
      <Typography.Text type="secondary">每条横条表示该阶段内部的批次占比。选择天数档可筛选下方清单。</Typography.Text>
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
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space[1] }}>
      <span style={{ color: text.secondary }}>当前筛选 {filterText(props.filters)}</span>
      <Button type="text" onClick={() => props.onSearch(CLEAR_FILTERS)}>显示全部</Button>
    </div>
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
      columns={stuckColumns({ now: props.now, isPhone, isNarrowPhone })}
      dataSource={[...props.rows]}
      {...(isPhone ? { expandable: { expandedRowRender: (row: StuckTableRow) => mobileStuckRowDetails(row, props.now) } } : {})}
      {...(isPhone ? {} : { scroll: { x: 'max-content' as const } })}
    />
  );
}

function stuckColumns(input: { readonly now: Date; readonly isPhone: boolean; readonly isNarrowPhone: boolean }): TableColumnType<StuckTableRow>[] {
  if (input.isPhone) return mobileStuckColumns(input.isNarrowPhone);
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
    textColumn('单号', 'po'),
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
