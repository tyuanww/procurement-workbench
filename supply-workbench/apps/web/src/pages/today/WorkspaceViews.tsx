import { TodayHighlight } from '../../features/today/index.js';
import { AppstoreOutlined, CalendarOutlined, LeftOutlined, RightOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Badge, Button, Calendar, Card, ConfigProvider, DatePicker, Flex, Typography, type ThemeConfig } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useEffect, useId, useRef, useState, type ComponentRef, type KeyboardEvent } from 'react';
import type { TodayPaging } from '@sw/contracts';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { fontSize, space, statusColor, text } from '../../theme/tokens.js';
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

type CalendarCountOf = (date: string) => string | undefined;

export type CalendarTodayAdditions = { readonly day: string; readonly count: number | undefined; readonly isPartial: boolean };

type WorkspaceCalendarProps = {
  readonly calendar: TodayPaging['calendar'];
  readonly date: string;
  readonly inbox: WorkspaceInbox;
  readonly onDay: (date: string) => void;
  readonly todayAdditions: CalendarTodayAdditions | undefined;
};

export function WorkspaceCalendar({ date, inbox, onDay, ...countsInput }: WorkspaceCalendarProps) {
  const selected = dayjs(date).locale('zh-cn');
  const { month, browse } = useCalendarMonth({ selected, inbox });
  const { countOf, calendarMonth, hasSchedulePreview } = calendarCounts({ ...countsInput, inbox });
  const chooseDay = (day: Dayjs) => onDay(dateKey(day));
  return <Card size="small" className="today-calendar" role="region" aria-label="工作台日历">
    <style>{workspaceCalendarCss}</style>
    <div className="today-calendar-mobile">
      <CalendarDatePicker selected={selected} onDay={chooseDay} countOf={countOf} calendarMonth={calendarMonth} />
    </div>
    <div className="today-calendar-desktop">
      <CalendarGrid month={month} selected={selected} onDay={chooseDay} onBrowse={browse} countOf={countOf} />
    </div>
    <Flex className="today-calendar-notes" gap="small" align="center" wrap>
      {countsInput.todayAdditions?.isPartial === true ? <CalendarNote>今日项数暂不含排期</CalendarNote> : null}
      <div className="today-calendar-desktop">
        <CalendarMonthNote month={month} calendarMonth={calendarMonth} hasSchedulePreview={hasSchedulePreview} />
      </div>
    </Flex>
  </Card>;
}

function useCalendarMonth({ selected, inbox }: { readonly selected: Dayjs; readonly inbox: WorkspaceInbox }) {
  const date = dateKey(selected);
  const [panel, setPanel] = useState({ date, inbox, month: selected.startOf('month') });
  if (panel.date !== date || panel.inbox !== inbox) setPanel({ date, inbox, month: selected.startOf('month') });
  return { month: panel.month, browse: (month: Dayjs) => setPanel({ date, inbox, month: month.startOf('month') }) };
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

function CalendarGrid({ month, selected, onDay, onBrowse, countOf }: {
  readonly month: Dayjs;
  readonly selected: Dayjs;
  readonly onDay: (day: Dayjs) => void;
  readonly onBrowse: (month: Dayjs) => void;
  readonly countOf: CalendarCountOf;
}) {
  const monthKey = month.format('YYYY-MM');
  const selection = dateKey(selected);
  const grid = useRef<ComponentRef<typeof Calendar>>(null);
  const pickedDate = useRef<string | null>(null);
  const [focus, setFocus] = useState<{ readonly month: string; readonly selection: string; readonly date: string }>();
  const tabDate = focus?.month === monthKey && focus.selection === selection ? focus.date
    : dateKey(month.isSame(selected, 'month') ? selected : month);
  useEffect(() => {
    if (pickedDate.current !== selection) return;
    pickedDate.current = null;
    grid.current?.nativeElement.querySelector<HTMLButtonElement>(`[data-calendar-date="${selection}"]`)?.focus({ preventScroll: true });
  }, [selection]);
  return <ConfigProvider theme={calendarTheme}>
    <Calendar ref={grid} value={month} fullscreen={false}
      headerRender={({ value, onChange }) => <CalendarHeader month={value} onBrowse={onChange} />}
      styles={{ body: { paddingBlock: space[0] }, item: { paddingBlock: 0 } }}
      onSelect={(day, { source }) => {
        if (source === 'customize') onBrowse(day);
        if (source === 'date') {
          const date = dateKey(day);
          if (date !== selection && document.activeElement?.getAttribute('data-calendar-date') === date) pickedDate.current = date;
          onDay(day);
        }
      }}
      fullCellRender={(current) => <CalendarDay day={current} count={countOf(dateKey(current))} selected={selection} tabDate={tabDate}
        onFocus={(date) => setFocus({ month: monthKey, selection, date })} />} />
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
  const isSelected = date === selected;
  return <div className="today-calendar-cell"><Button color="default" variant="text" size="small" className="today-calendar-day" data-calendar-date={date}
    aria-label={`${day.format('YYYY年M月D日')}${count === undefined ? '' : `，${count}`}`}
    aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
    aria-pressed={isSelected} tabIndex={date === tabDate ? undefined : -1}
    onFocus={() => onFocus(date)} onKeyDown={(event) => moveDateFocus(event, day)}>
    {day.date()}{count === undefined ? null : <CalendarNotice count={count} />}
  </Button><TodayHighlight active={isSelected} /></div>;
}

function CalendarNotice({ count }: { readonly count: string }) {
  const color = count.endsWith('批') ? statusColor.info.text : statusColor.neutral.text;
  return <span className="today-calendar-count" aria-hidden="true"><Badge color={color} text={count} /></span>;
}

function CalendarMonthNote({ month, calendarMonth, hasSchedulePreview }: {
  readonly month: Dayjs;
  readonly calendarMonth: string | undefined;
  readonly hasSchedulePreview: boolean;
}) {
  if (calendarMonth !== undefined && month.format('YYYY-MM') !== calendarMonth) return <CalendarNote>选择日期后查看该月数量</CalendarNote>;
  return hasSchedulePreview ? <CalendarNote>待办按项计，未来日期的已约跟进按批计</CalendarNote> : null;
}

function CalendarNote({ children }: { readonly children: string }) {
  return <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{children}</Typography.Text>;
}

function CalendarHeader({ month, onBrowse }: {
  readonly month: Dayjs;
  readonly onBrowse: (month: Dayjs) => void;
}) {
  return <Flex className="today-calendar-heading" wrap gap="small" align="center" justify="space-between">
    <Typography.Title level={2}>工作日历</Typography.Title>
    <Flex className="today-calendar-months today-touch" align="center" gap="small">
      <Button size="small" aria-label="上月" icon={<LeftOutlined aria-hidden />} onClick={() => onBrowse(month.subtract(1, 'month'))} />
      <DatePicker size="small" picker="month" aria-label="选择日历月份" format="YYYY年M月" value={month} allowClear={false}
        className="today-calendar-month-input" onChange={(next) => { if (next !== null) onBrowse(next); }} />
      <Button size="small" aria-label="下月" icon={<RightOutlined aria-hidden />} onClick={() => onBrowse(month.add(1, 'month'))} />
    </Flex>
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
