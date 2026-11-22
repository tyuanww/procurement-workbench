import { DatePicker, Segmented } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import type { CSSProperties } from 'react';
import {
  DASHBOARD_LANES,
  DASHBOARD_PRESETS,
  type DashboardLane,
  type DashboardPatch,
  type DashboardPreset,
  type DashboardQuery,
} from '../../features/performance/index.js';
import { brand, fontSize, radius, space, text } from '../../theme/tokens.js';

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
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
      <PeriodChips query={props.query} onSearch={props.onSearch} />
      {props.query.view === 'project' ? null : <LaneChips lane={props.query.lane} onSearch={props.onSearch} />}
      <PeriodPicker query={props.query} onSearch={props.onSearch} />
      <span
        style={{
          color: text.secondary,
          fontVariantNumeric: 'tabular-nums',
          fontSize: fontSize.body,
        }}
      >
        {props.query.from} 至 {props.query.to}
      </span>
      {props.query.preset === 'custom' ? <span style={{ color: brand[600] }}>自定义</span> : null}
    </div>
  );
}

function PeriodChips(props: { readonly query: DashboardQuery; readonly onSearch: SearchHandler }) {
  return (
    <Segmented
      aria-label="期间"
      value={props.query.preset}
      options={namedPresetOptions()}
      onChange={(value) => choosePreset(String(value), props.onSearch)}
    />
  );
}

function LaneChips(props: { readonly lane: DashboardLane; readonly onSearch: SearchHandler }) {
  return (
    <Segmented
      aria-label="线"
      value={props.lane}
      options={DASHBOARD_LANES.map((lane) => ({ label: LANE_LABEL[lane], value: lane }))}
      onChange={(value) => chooseLane(String(value), props.onSearch)}
    />
  );
}

function PeriodPicker(props: { readonly query: DashboardQuery; readonly onSearch: SearchHandler }) {
  return (
    <DatePicker.RangePicker
      format="YYYY-MM-DD"
      placeholder={['开始', '结束']}
      value={[pickerDay(props.query.from), pickerDay(props.query.to)]}
      onChange={(_dates, dateStrings) => commitRange(dateStrings, props.onSearch)}
      style={pickerStyle(props.query.preset === 'custom')}
    />
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

function chooseLane(value: string, onSearch: SearchHandler): void {
  const lane = DASHBOARD_LANES.find((item) => item === value);
  if (lane === undefined) return;
  onSearch({ lane });
}

function commitRange(dateStrings: [string, string] | null, onSearch: SearchHandler): void {
  if (dateStrings === null) return;
  const from = dateStrings[0];
  const to = dateStrings[1];
  if (from === undefined || to === undefined || from === '' || to === '') return;
  onSearch({ preset: 'custom', from, to });
}

function pickerStyle(isCustom: boolean): CSSProperties {
  return { outline: isCustom ? `2px solid ${brand[600]}` : 'none', borderRadius: radius };
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
