import { AppstoreOutlined, CalendarOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Button, Calendar, Card, ConfigProvider, DatePicker, Flex, Radio, Select, Typography, type CalendarProps, type ThemeConfig } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useEffect, useId, useRef, useState, type ComponentRef, type KeyboardEvent } from 'react';
import type { TodayPaging } from '@sw/contracts';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { fontSize, space, text } from '../../theme/tokens.js';
import type { WorkspaceInbox, WorkspaceView } from './action-query.js';
import { workspaceCalendarCss } from './workspace-calendar-style.js';

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
  readonly onBusinessDay: (() => void) | undefined;
};

export function WorkspaceViewControls({ view, onView }: Pick<WorkspaceControls, 'view' | 'onView'>) {
  return <ViewSwitch<WorkspaceView> className="today-workspace-views" aria-label="工作台视图" value={view} options={options} onChange={onView} />;
}

const calendarTheme: ThemeConfig = {
  components: { Calendar: { colorTextDisabled: text.tertiary, miniContentHeight: 188 } },
};

type CalendarMode = NonNullable<CalendarProps<Dayjs>['mode']>;
type CalendarPanel = { readonly day: Dayjs; readonly mode: CalendarMode };
type CalendarCountOf = (date: string) => string | undefined;

type WorkspaceCalendarProps = {
  readonly calendar: TodayPaging['calendar'];
  readonly date: string;
  readonly inbox: WorkspaceInbox;
  readonly onDay: (date: string) => void;
  readonly todayAdditions: { readonly day: string; readonly count: number | undefined; readonly isPartial: boolean } | undefined;
};

export function WorkspaceCalendar({ date, inbox, onDay, ...countsInput }: WorkspaceCalendarProps) {
  const selected = dayjs(date).locale('zh-cn');
  const { panel, browse } = useCalendarPanel({ selected, inbox });
  const { countOf, calendarMonth, hasSchedulePreview } = calendarCounts({ ...countsInput, inbox });
  const chooseDay = (selected: Dayjs) => onDay(dateKey(selected));
  return <Card size="small" className="today-calendar" role="region" aria-label="工作台日历">
    <style>{workspaceCalendarCss}</style>
    <Flex className="today-calendar-tools" gap="small" align="center" wrap>
      <CalendarDatePicker selected={selected} onDay={chooseDay} countOf={countOf} calendarMonth={calendarMonth} />
      <div className="today-calendar-desktop">
        <CalendarHeader value={panel.day} mode={panel.mode} onBrowse={browse} />
      </div>
      {countsInput.todayAdditions?.isPartial === true ? <CalendarNote>今日项数暂不含排期</CalendarNote> : null}
      <div className="today-calendar-desktop">
        <CalendarMonthNote panel={panel} calendarMonth={calendarMonth} hasSchedulePreview={hasSchedulePreview} />
      </div>
    </Flex>
    <div className="today-calendar-desktop">
      <CalendarGrid panel={panel} selected={selected} onDay={chooseDay} onBrowse={browse} countOf={countOf} />
    </div>
  </Card>;
}

function useCalendarPanel({ selected, inbox }: { readonly selected: Dayjs; readonly inbox: WorkspaceInbox }) {
  const date = dateKey(selected);
  const [panel, setPanel] = useState<CalendarPanel & { readonly date: string; readonly inbox: WorkspaceInbox }>(
    { date, inbox, day: selected, mode: 'month' },
  );
  if (panel.date !== date || panel.inbox !== inbox) setPanel({ date, inbox, day: selected, mode: 'month' });
  return { panel, browse: (day: Dayjs, mode: CalendarMode) => setPanel({ date, inbox, day, mode }) };
}

function calendarCounts({ calendar, inbox, todayAdditions }: Pick<WorkspaceCalendarProps, 'calendar' | 'inbox' | 'todayAdditions'>) {
  const counts = new Map<string, number>(calendar?.days.map(({ date, count }) => [date, count]));
  if (todayAdditions !== undefined) addToday({ counts, ...todayAdditions });
  const scheduledDays = inbox === 'today' ? calendar?.scheduledDays : undefined;
  const scheduledCounts = new Map<string, number>(scheduledDays?.map(({ date, count }) => [date, count]));
  const countOf: CalendarCountOf = (key) => {
    const scheduled = scheduledCounts.get(key);
    const count = scheduled ?? counts.get(key);
    const unit = scheduled !== undefined || inbox === 'scheduled' ? '批' : '项';
    return count === undefined ? undefined : `${count}${unit}`;
  };
  return { countOf, calendarMonth: calendar?.date.slice(0, 7), hasSchedulePreview: scheduledDays !== undefined };
}

function CalendarDatePicker({ selected, onDay, countOf, calendarMonth }: {
  readonly selected: Dayjs;
  readonly onDay: (day: Dayjs) => void;
  readonly countOf: CalendarCountOf;
  readonly calendarMonth: string | undefined;
}) {
  const id = useId();
  return <Flex align="center" gap="small" wrap>
    <label htmlFor={id}>工作日期</label>
    <DatePicker id={id} aria-label="选择工作日期" className="today-calendar-input" value={selected} allowClear={false} showToday={false}
      classNames={{ popup: { root: 'today-calendar-popup', header: 'today-calendar-popup-header' } }}
      popupAlign={{ offset: [0, 0], overflow: { adjustX: 1, adjustY: 1, shiftX: true, shiftY: true } }}
      onChange={(day) => { if (day !== null) onDay(day); }}
      cellRender={(current, info) => {
        const count = info.type === 'date' ? countOf(dateKey(dayjs(current))) : undefined;
        return count === undefined ? info.originNode : <>{info.originNode}<span className="today-calendar-count">{count}</span></>;
      }}
      {...(calendarMonth === undefined ? {} : { renderExtraFooter: () => `仅显示${dayjs(calendarMonth).format('YYYY年M月')}数量` })} />
  </Flex>;
}

function CalendarGrid({ panel, selected, onDay, onBrowse, countOf }: {
  readonly panel: CalendarPanel;
  readonly selected: Dayjs;
  readonly onDay: (day: Dayjs) => void;
  readonly onBrowse: (day: Dayjs, mode: CalendarMode) => void;
  readonly countOf: CalendarCountOf;
}) {
  const month = panel.day.format('YYYY-MM');
  const selection = dateKey(selected);
  const grid = useRef<ComponentRef<typeof Calendar>>(null);
  const shouldFocusDay = useRef(false);
  const [focus, setFocus] = useState<{ readonly month: string; readonly selection: string; readonly date: string }>();
  const tabDate = focus?.month === month && focus.selection === selection ? focus.date
    : dateKey(panel.day.isSame(selected, 'month') ? selected : panel.day.startOf('month'));
  useEffect(() => {
    if (panel.mode !== 'month' || !shouldFocusDay.current) return;
    shouldFocusDay.current = false;
    grid.current?.nativeElement.querySelector<HTMLButtonElement>(`[data-calendar-date="${tabDate}"]`)?.focus();
  }, [panel.mode, tabDate]);
  return <ConfigProvider theme={calendarTheme}>
    <Calendar ref={grid} value={panel.day} mode={panel.mode} fullscreen={false} headerRender={() => null}
      styles={{ body: { paddingBlock: space[0] }, item: { paddingBlock: 0 } }}
      onSelect={(day, { source }) => {
        if (source === 'date') onDay(day);
        else if (source === 'month') {
          shouldFocusDay.current = true;
          onBrowse(day, 'month');
        }
      }}
      fullCellRender={(current, { type }) => type === 'date'
        ? <CalendarDay day={current} count={countOf(dateKey(current))} selected={selection} tabDate={tabDate}
          onFocus={(date) => setFocus({ month, selection, date })} />
        : <Button type="text" size="small" className="today-calendar-day" aria-label={current.format('YYYY年M月')}
          aria-pressed={current.isSame(selected, 'month')}>{current.format('M月')}</Button>} />
  </ConfigProvider>;
}

function CalendarDay({ day, count, selected, tabDate, onFocus }: {
  readonly day: Dayjs;
  readonly count: string | undefined;
  readonly selected: string;
  readonly tabDate: string;
  readonly onFocus: (date: string) => void;
}) {
  const date = dateKey(day);
  return <Button type="text" size="small" className="today-calendar-day" data-calendar-date={date}
    aria-label={`${day.format('YYYY年M月D日')}${count === undefined ? '' : `，${count}`}`}
    aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
    aria-pressed={date === selected} tabIndex={date === tabDate ? undefined : -1}
    onFocus={() => onFocus(date)} onKeyDown={(event) => moveDateFocus(event, day)}>
    {day.date()}{count === undefined ? null : <span className="today-calendar-count">{count}</span>}
  </Button>;
}

function CalendarMonthNote({ panel, calendarMonth, hasSchedulePreview }: {
  readonly panel: CalendarPanel;
  readonly calendarMonth: string | undefined;
  readonly hasSchedulePreview: boolean;
}) {
  if (panel.mode !== 'month') return null;
  if (calendarMonth !== undefined && panel.day.format('YYYY-MM') !== calendarMonth) return <CalendarNote>选择日期后查看该月数量</CalendarNote>;
  return hasSchedulePreview ? <CalendarNote>待办按项计，未来日期的已约跟进按批计</CalendarNote> : null;
}

function CalendarNote({ children }: { readonly children: string }) {
  return <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{children}</Typography.Text>;
}

const calendarMonths = Array.from({ length: 12 }, (_, month) => ({ value: month, label: `${month + 1}月` }));

function CalendarHeader({ value, mode, onBrowse }: {
  readonly value: Dayjs;
  readonly mode: CalendarMode;
  readonly onBrowse: (day: Dayjs, mode: CalendarMode) => void;
}) {
  const year = value.year();
  const years = Array.from({ length: 20 }, (_, index) => {
    const choice = year - 10 + index;
    return { value: choice, label: `${choice}年` };
  });
  return <Flex className="today-touch" wrap gap="small" align="center">
    <Select size="small" aria-label="日历年份" value={year} options={years} virtual={false}
      onChange={(next) => onBrowse(value.year(next), mode)} />
    {mode === 'year' ? null : <Select size="small" aria-label="日历月份" value={value.month()} options={calendarMonths} virtual={false}
      onChange={(next) => onBrowse(value.month(next), mode)} />}
    <Radio.Group size="small" aria-label="日历显示方式" value={mode}
      onChange={(event) => onBrowse(value, event.target.value === 'year' ? 'year' : 'month')}>
      <Radio.Button value="month">月</Radio.Button>
      <Radio.Button value="year">年</Radio.Button>
    </Radio.Group>
  </Flex>;
}

function dateKey(date: Dayjs): string {
  return date.format('YYYY-MM-DD');
}

const dateOffsets = new Map([['ArrowLeft', -1], ['ArrowRight', 1], ['ArrowUp', -7], ['ArrowDown', 7]]);

function moveDateFocus(event: KeyboardEvent<HTMLElement>, day: Dayjs) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  const offset = dateOffsets.get(event.key);
  if (offset === undefined) return;
  const next = dateKey(day.add(offset, 'day'));
  const button = event.currentTarget.closest('table')?.querySelector<HTMLButtonElement>(`[data-calendar-date="${next}"]`);
  if (button === undefined || button === null) return;
  event.preventDefault();
  button.focus();
}

function addToday({ counts, day, count }: { readonly counts: Map<string, number>; readonly day: string; readonly count: number | undefined }): void {
  if (count === undefined) counts.delete(day);
  else if (count > 0) counts.set(day, (counts.get(day) ?? 0) + count);
}
