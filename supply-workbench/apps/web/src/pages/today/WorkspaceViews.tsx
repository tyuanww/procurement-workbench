import { AppstoreOutlined, CalendarOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Calendar, Card, ConfigProvider, DatePicker, Flex, Radio, Select, Typography, type CalendarProps, type ThemeConfig } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { Link } from 'react-router';
import type { TodayPaging } from '@sw/contracts';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { fontSize, space, text } from '../../theme/tokens.js';
import { arrivalShortcutPath } from './TodayLinks.js';
import type { WorkspaceInbox, WorkspaceView } from './action-query.js';

const options = [
  { label: '列表', value: 'list', icon: <UnorderedListOutlined aria-hidden /> },
  { label: '看板', value: 'board', icon: <AppstoreOutlined aria-hidden /> },
  { label: '日历', value: 'calendar', icon: <CalendarOutlined aria-hidden /> },
] satisfies Parameters<typeof ViewSwitch<WorkspaceView>>[0]['options'];

export type WorkspaceControls = {
  readonly inbox: WorkspaceInbox;
  readonly view: WorkspaceView;
  readonly onInbox: (inbox: WorkspaceInbox) => void;
  readonly onView: (view: WorkspaceView) => void;
  readonly onDay: (date: string) => void;
};

export function WorkspaceViewControls({ view, onView }: Pick<WorkspaceControls, 'view' | 'onView'>) {
  return <ViewSwitch<WorkspaceView> className="today-workspace-views" aria-label="工作台视图" value={view} options={options} onChange={onView} />;
}

export function WorkspaceDestinations({ search }: { readonly search: string }) {
  const schedule = new URLSearchParams({ group: 'schedule', mine: '1' });
  const from = new URLSearchParams(search);
  from.delete('drawer');
  from.delete('draft');
  if (from.size > 0) schedule.set('workspaceReturn', from.toString());
  return <>
    <Link to={'/today?' + schedule}>今日排期</Link>
    <Link to={arrivalShortcutPath({ returnSearch: search })}>在途待收</Link>
  </>;
}

const calendarTheme: ThemeConfig = {
  components: { Calendar: { colorTextDisabled: text.tertiary } },
};

export function WorkspaceCalendar({ calendar, date, inbox, onDay, todayAdditions }: {
  readonly calendar: TodayPaging['calendar'];
  readonly date: string;
  readonly inbox: WorkspaceInbox;
  readonly onDay: (date: string) => void;
  readonly todayAdditions: { readonly day: string; readonly count: number | undefined; readonly isPartial: boolean } | undefined;
}) {
  const day = dayjs(date).locale('zh-cn');
  const counts = new Map<string, number>(calendar?.days.map(({ date, count }) => [date, count]));
  if (todayAdditions !== undefined) addToday({ counts, ...todayAdditions });
  const scheduledCounts = new Map<string, number>(inbox === 'today' ? calendar?.scheduledDays?.map(({ date, count }) => [date, count]) : undefined);
  return <Card size="small" className="today-calendar" role="region" aria-label="工作台日历">
    <Flex vertical gap="small">
      <Flex gap="small" align="center" wrap>
        <DatePicker aria-label="选择工作日期" value={day} allowClear={false}
          onChange={(selected) => { if (selected !== null) onDay(selected.format('YYYY-MM-DD')); }} />
        <CalendarNotes hasSchedulePreview={inbox === 'today' && calendar?.scheduledDays !== undefined}
          hasPartialCount={todayAdditions?.isPartial === true} />
      </Flex>
      <ConfigProvider theme={calendarTheme}>
        <Calendar value={day} fullscreen={false} onSelect={(selected) => onDay(selected.format('YYYY-MM-DD'))}
          headerRender={calendarHeader}
          cellRender={(date, info) => {
            if (info.type !== 'date') return null;
            const key = date.format('YYYY-MM-DD');
            const scheduled = scheduledCounts.get(key);
            const count = scheduled ?? counts.get(key);
            const unit = scheduled !== undefined || inbox === 'scheduled' ? '批' : '项';
            return count === undefined ? null : <span style={{ display: 'block', color: text.secondary, whiteSpace: 'nowrap', fontSize: fontSize.meta }}>{count}{unit}</span>;
          }} />
      </ConfigProvider>
    </Flex>
  </Card>;
}

function CalendarNotes({ hasSchedulePreview, hasPartialCount }: { readonly hasSchedulePreview: boolean; readonly hasPartialCount: boolean }) {
  return <>
    {hasSchedulePreview ? <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>待办按项计，未来日期的已约跟进按批计</Typography.Text> : null}
    {hasPartialCount ? <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>今日项数暂不含排期</Typography.Text> : null}
  </>;
}

const calendarMonths = Array.from({ length: 12 }, (_, month) => ({ value: month, label: `${month + 1}月` }));

function calendarHeader({ value, type, onChange, onTypeChange }: Parameters<NonNullable<CalendarProps<Dayjs>['headerRender']>>[0]) {
  const year = value.year();
  const years = Array.from({ length: 20 }, (_, index) => {
    const choice = year - 10 + index;
    return { value: choice, label: `${choice}年` };
  });
  return <Flex className="today-touch" wrap gap="small" justify="end" align="center" style={{ paddingBlock: space[1] }}>
    <Select size="small" aria-label="日历年份" value={year} options={years} virtual={false}
      onChange={(next) => onChange(value.year(next))} />
    {type === 'year' ? null : <Select size="small" aria-label="日历月份" value={value.month()} options={calendarMonths} virtual={false}
      onChange={(next) => onChange(value.month(next))} />}
    <Radio.Group size="small" aria-label="日历显示方式" value={type}
      onChange={(event) => onTypeChange(event.target.value === 'year' ? 'year' : 'month')}>
      <Radio.Button value="month">月</Radio.Button>
      <Radio.Button value="year">年</Radio.Button>
    </Radio.Group>
  </Flex>;
}

function addToday({ counts, day, count }: { readonly counts: Map<string, number>; readonly day: string; readonly count: number | undefined }): void {
  if (count === undefined) counts.delete(day);
  else if (count > 0) counts.set(day, (counts.get(day) ?? 0) + count);
}
