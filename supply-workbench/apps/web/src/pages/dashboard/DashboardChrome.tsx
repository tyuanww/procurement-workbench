import { Card, DatePicker, Flex, Segmented, Select, Tag, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useId, type CSSProperties } from 'react';
import { useShellViewport } from '../../features/shell/index.js';
import {
  DASHBOARD_LANES,
  DASHBOARD_PRESETS,
  type DashboardLane,
  type DashboardPatch,
  type DashboardPreset,
  type DashboardQuery,
} from '../../features/performance/index.js';
import { space } from '../../theme/tokens.js';

type SearchHandler = (patch: DashboardPatch) => void;

const PRESET_LABEL: Record<DashboardPreset, string> = {
  'recent-month': '近一个月',
  'this-week': '本周',
  'last-week': '上周',
  'four-weeks': '近 4 周',
  'this-month': '本月',
  custom: '自定义',
};

const LANE_LABEL: Record<DashboardLane, string> = {
  all: '全部',
  finished: '成品',
  material: '物料',
};

export function DashboardChrome(props: {
  readonly query: DashboardQuery;
  readonly onSearch: SearchHandler;
}) {
  return (
    <Card size="small">
      <Flex wrap gap={space[2]} align="center">
        <PeriodChips query={props.query} onSearch={props.onSearch} />
        {props.query.view === 'project' ? null : <LaneChips lane={props.query.lane} onSearch={props.onSearch} />}
        <PeriodPicker query={props.query} onSearch={props.onSearch} />
        <Typography.Text type="secondary">{props.query.from} 至 {props.query.to}</Typography.Text>
        {props.query.preset === 'custom' ? <Tag>自定义日期</Tag> : null}
      </Flex>
    </Card>
  );
}

function PeriodChips({ query, onSearch }: { readonly query: DashboardQuery; readonly onSearch: SearchHandler }) {
  const isPhone = useShellViewport().band === 'phone';
  const options = namedPresetOptions();
  if (isPhone) {
    return <Select<DashboardPreset>
      aria-label="期间"
      value={query.preset}
      options={query.preset === 'custom' ? [...options, { value: 'custom', label: PRESET_LABEL.custom }] : options}
      onChange={(value) => choosePreset(value, onSearch)}
      style={{ minWidth: 120 }}
    />;
  }
  return <Segmented aria-label="期间" value={query.preset} options={options} onChange={(value) => choosePreset(value, onSearch)} />;
}

function LaneChips(props: { readonly lane: DashboardLane; readonly onSearch: SearchHandler }) {
  return (
    <Segmented
      aria-label="线别"
      value={props.lane}
      options={DASHBOARD_LANES.map((lane) => ({ label: LANE_LABEL[lane], value: lane }))}
      onChange={(lane) => props.onSearch({ lane })}
    />
  );
}

const hiddenLabel: CSSProperties = {
  position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)',
};

function PeriodPicker(props: { readonly query: DashboardQuery; readonly onSearch: SearchHandler }) {
  const start = useId();
  const end = useId();
  return (
    <Flex role="group" aria-label="统计起止日期" style={{ maxWidth: '100%' }}>
      <label htmlFor={start} style={hiddenLabel}>开始日期</label>
      <label htmlFor={end} style={hiddenLabel}>结束日期</label>
      <DatePicker.RangePicker
        format="YYYY-MM-DD"
        placeholder={['开始日期', '结束日期']}
        id={{ start, end }}
        allowClear={false}
        value={[pickerDay(props.query.from), pickerDay(props.query.to)]}
        onChange={(_dates, dateStrings) => commitRange(dateStrings, props.onSearch)}
        style={{ maxWidth: '100%' }}
      />
    </Flex>
  );
}

function namedPresetOptions(): { readonly label: string; readonly value: DashboardPreset }[] {
  return DASHBOARD_PRESETS.filter((preset) => preset !== 'custom').map((preset) => ({
    label: PRESET_LABEL[preset],
    value: preset,
  }));
}

function choosePreset(value: string, onSearch: SearchHandler): void {
  const preset = DASHBOARD_PRESETS.find((item) => item === value);
  if (preset === undefined || preset === 'custom') return;
  onSearch({ preset });
}

function commitRange(dateStrings: [string, string] | null, onSearch: SearchHandler): void {
  if (dateStrings === null) return;
  const from = dateStrings[0];
  const to = dateStrings[1];
  if (from === undefined || to === undefined || from === '' || to === '') return;
  onSearch({ preset: 'custom', from, to });
}

function pickerDay(day: string): Dayjs {
  const parts = calendarParts(day);
  return dayjs(new Date(parts.year, parts.month - 1, parts.day));
}

function calendarParts(day: string): {
  readonly year: number;
  readonly month: number;
  readonly day: number;
} {
  const [yearText, monthText, dayText] = day.split('-');
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    throw new Error('看板日期无法放进选择器');
  }
  return { year: Number(yearText), month: Number(monthText), day: Number(dayText) };
}
