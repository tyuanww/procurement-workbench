import { Button, Empty, Statistic, Table, Typography, type TableColumnType } from 'antd';
import type { CSSProperties } from 'react';
import { batchStatusLabel, type BatchStatus } from '@sw/domain';
import { formatTableDate } from '../../shared/ui/format.js';
import {
  EM_DASH,
  type DashboardPatch,
  type BottleneckCause,
  type StuckBucket,
  type StuckCards,
  type StuckItemInput,
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

const CARD_LABEL: Record<StuckCards[number]['key'], string> = {
  openBatches: '开放批次',
  overdue: '逾期',
  awaitingDate: '待确认日期',
  shippedNotReceived: '已发待收',
};

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
  readonly cards: StuckCards;
  readonly stuck: StuckView;
  readonly items: readonly StuckItemInput[];
  readonly from: string;
  readonly to: string;
  readonly stage: BatchStatus | null;
  readonly bucket: StuckBucket | null;
  readonly cause: BottleneckCause | null;
  readonly onSearch: SearchHandler;
  readonly now: Date;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <CardRow
        cards={props.cards}
        stage={props.stage}
        bucket={props.bucket}
        onSearch={props.onSearch}
      />
      <CauseFilter items={props.items} from={props.from} to={props.to} cause={props.cause} stage={props.stage} bucket={props.bucket} onSearch={props.onSearch} />
      <DwellChart dwell={props.stuck.dwell} onSearch={props.onSearch} />
      <StuckFilter stage={props.stage} bucket={props.bucket} cause={props.cause} hasRows={props.stuck.rows.length > 0} onSearch={props.onSearch} />
      <Typography.Title level={2} style={{ margin: 0 }}>
        卡点清单
      </Typography.Title>
      {props.stuck.rows.length === 0 ? (
        <Empty description="当前筛选没有卡点。下一步：显示全部。">
          <Button onClick={() => props.onSearch({ stage: null, bucket: null, cause: null })}>显示全部</Button>
        </Empty>
      ) : (
        <StuckTable rows={props.stuck.rows} now={props.now} />
      )}
    </div>
  );
}

function CardRow(props: {
  readonly cards: StuckCards;
  readonly stage: BatchStatus | null;
  readonly bucket: StuckBucket | null;
  readonly onSearch: SearchHandler;
}) {
  const cards = [...props.cards].sort(cardPriority);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2] }}>
      {cards.map((card) => (
        <Button
          key={card.key}
          type="text"
          aria-pressed={isCardActive({ key: card.key, stage: props.stage, bucket: props.bucket })}
          onClick={() => chooseCard(card.key, props.onSearch)}
          style={{
            ...metricBox,
            textAlign: 'left',
            cursor: 'pointer',
            borderTop: metricAccent(card.key),
            borderBottomColor: isCardActive({
              key: card.key,
              stage: props.stage,
              bucket: props.bucket,
            })
              ? brand[600]
              : border,
          }}
        >
          <Statistic
            title={CARD_LABEL[card.key]}
            value={card.value}
            styles={{ content: metricStyle }}
          />
        </Button>
      ))}
    </div>
  );
}

function metricAccent(key: StuckCards[number]['key']): string {
  if (key === 'overdue') return `2px solid ${statusColor.danger.border}`;
  if (key === 'awaitingDate') return `2px solid ${statusColor.warning.border}`;
  return '2px solid transparent';
}

function cardPriority(left: StuckCards[number], right: StuckCards[number]): number {
  const order: Record<StuckCards[number]['key'], number> = {
    overdue: 0,
    awaitingDate: 1,
    openBatches: 2,
    shippedNotReceived: 3,
  };
  return order[left.key] - order[right.key];
}

function chooseCard(key: StuckCards[number]['key'], onSearch: SearchHandler): void {
  switch (key) {
    case 'overdue':
      window.location.assign('/lines?overdue=1');
      return;
    case 'awaitingDate':
      onSearch({ stage: 'awaiting_date', bucket: null });
      return;
    case 'shippedNotReceived':
      onSearch({ stage: 'shipped', bucket: null });
      return;
    case 'openBatches':
      onSearch({ stage: null, bucket: null });
      return;
  }
}

function isCardActive(input: {
  readonly key: StuckCards[number]['key'];
  readonly stage: BatchStatus | null;
  readonly bucket: StuckBucket | null;
}): boolean {
  if (input.key === 'overdue') return false;
  if (input.key === 'awaitingDate') return input.stage === 'awaiting_date' && input.bucket === null;
  if (input.key === 'shippedNotReceived') return input.stage === 'shipped' && input.bucket === null;
  return input.stage === null && input.bucket === null;
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
          onSelect: (bucket) => { const selected = bucketOf(bucket); if (selected !== undefined) props.onSearch({ stage: row.stage, bucket: selected }); },
        }))}
      />
    </div>
  );
}

const BUCKETS: readonly StuckBucket[] = ['0-3', '4-7', '8-14', '15+'];

function bucketOf(value: string): StuckBucket | undefined {
  return BUCKETS.find((bucket) => bucket === value);
}

function StuckFilter(props: {
  readonly stage: BatchStatus | null;
  readonly bucket: StuckBucket | null;
  readonly cause: BottleneckCause | null;
  readonly hasRows: boolean;
  readonly onSearch: SearchHandler;
}) {
  if (props.stage === null && props.bucket === null && props.cause === null) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space[1] }}>
      <span style={{ color: text.secondary }}>
        当前筛选 {filterText({ stage: props.stage, bucket: props.bucket, cause: props.cause })}
      </span>
      {props.hasRows ? (
        <Button type="text" onClick={() => props.onSearch({ stage: null, bucket: null, cause: null })}>
          显示全部
        </Button>
      ) : null}
    </div>
  );
}

function filterText(input: { readonly stage: BatchStatus | null; readonly bucket: StuckBucket | null; readonly cause: BottleneckCause | null }): string {
  const stageText = input.stage === null ? '' : batchStatusLabel(input.stage);
  const bucketText = input.bucket ?? '';
  const causeText = input.cause === null ? '' : CAUSE_LABEL[input.cause];
  return [stageText, bucketText, causeText].filter((part) => part !== '').join(' ');
}

function StuckTable(props: { readonly rows: readonly StuckTableRow[]; readonly now: Date }) {
  const isPhone = useShellViewport().band === 'phone';
  const isNarrowPhone = isPhone && window.innerWidth <= 340;
  return (
    <Table<StuckTableRow>
      size="small"
      pagination={false}
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
