import { AppstoreOutlined, CalendarOutlined, LeftOutlined, RightOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Badge, Button, Calendar, Card, DatePicker, Flex, Typography, type CalendarProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useEffect, useId, useRef, useState, type ComponentRef, type KeyboardEvent } from 'react';
import type { TodayPaging } from '@sw/contracts';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { fontSize, space, statusColor } from '../../theme/tokens.js';
import type { WorkspaceInbox, WorkspaceView } from './action-query.js';
import type { CalendarBusinessDayPreview } from './use-calendar-business-day.js';
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

const noticeLabels = {
  todo: { label: '待办', unit: '项', color: statusColor.neutral.text },
  unassigned: { label: '待分派', unit: '项', color: statusColor.neutral.text },
  scheduled: { label: '已约跟进', unit: '批', color: statusColor.info.text },
} as const;

type CalendarNotice = { readonly kind: keyof typeof noticeLabels; readonly count: number };
type CalendarNoticeOf = (date: string) => CalendarNotice | undefined;
type CalendarMode = NonNullable<CalendarProps<Dayjs>['mode']>;
const calendarModes = [{ label: '月', value: 'month' }, { label: '年', value: 'year' }] satisfies CalendarModeOption[];
type CalendarModeOption = { readonly label: string; readonly value: CalendarMode };

export type CalendarTodayAdditions = { readonly day: string; readonly count: number | undefined; readonly isPartial: boolean };

type WorkspaceCalendarProps = {
  readonly calendar: TodayPaging['calendar'];
  readonly date: string;
  readonly inbox: WorkspaceInbox;
  readonly onDay: (date: string) => void;
  readonly todayAdditions: CalendarTodayAdditions | undefined;
  readonly businessDay: CalendarBusinessDayPreview | undefined;
};

export function WorkspaceCalendar({ date, inbox, onDay, ...countsInput }: WorkspaceCalendarProps) {
  const selected = dayjs(date).locale('zh-cn');
  const { month, browse } = useCalendarMonth({ selected, inbox });
  const { noticeOf, monthNotices, calendarMonth, hasSchedulePreview } = calendarNotices({ ...countsInput, inbox });
  const chooseDay = (day: Dayjs) => onDay(dateKey(day));
  return <Card size="small" className="today-calendar" role="region" aria-label="工作台日历">
    <style>{workspaceCalendarCss}</style>
    <div className="today-calendar-mobile">
      <CalendarDatePicker selected={selected} onDay={chooseDay} noticeOf={noticeOf} calendarMonth={calendarMonth} />
    </div>
    <div className="today-calendar-desktop">
      <CalendarGrid month={month} selected={selected} onDay={chooseDay} onBrowse={browse}
        noticeOf={noticeOf} monthNotices={monthNotices} calendarMonth={calendarMonth} hasSchedulePreview={hasSchedulePreview} />
    </div>
    {countsInput.todayAdditions?.isPartial === true || countsInput.businessDay?.notice?.isPartial === true
      ? <CalendarNote>今日项数暂不含排期</CalendarNote> : null}
    {countsInput.businessDay?.hasError === true ? <CalendarNote>业务日待办数量暂未更新</CalendarNote> : null}
  </Card>;
}

function useCalendarMonth({ selected, inbox }: { readonly selected: Dayjs; readonly inbox: WorkspaceInbox }) {
  const date = dateKey(selected);
  const [panel, setPanel] = useState({ date, inbox, month: selected.startOf('month') });
  if (panel.date !== date || panel.inbox !== inbox) setPanel({ date, inbox, month: selected.startOf('month') });
  return { month: panel.month, browse: (month: Dayjs) => setPanel({ date, inbox, month: month.startOf('month') }) };
}

function calendarNotices({ calendar, inbox, todayAdditions, businessDay }: Pick<WorkspaceCalendarProps, 'calendar' | 'inbox' | 'todayAdditions' | 'businessDay'>) {
  const counts = new Map<string, number>(calendarDays({ calendar, inbox })?.map(({ date, count }) => [date, count]));
  if (todayAdditions !== undefined) addToday({ counts, ...todayAdditions });
  const scheduledDays = inbox === 'today' ? calendar?.scheduledDays : undefined;
  const calendarMonth = calendar?.date.slice(0, 7);
  const kind = inbox === 'today' ? 'todo' : inbox;
  const notices = new Map<string, CalendarNotice>([...counts].map(([date, count]) => [date, { kind, count }]));
  for (const { date, count } of scheduledDays ?? []) {
    notices.set(date, { kind: 'scheduled', count });
  }
  mergeBusinessDay(notices, { calendarMonth, businessDay });
  const noticeOf: CalendarNoticeOf = (key) => notices.get(key);
  const monthNotices = monthSummary(notices, calendarMonth);
  return { noticeOf, monthNotices, calendarMonth, hasSchedulePreview: scheduledDays !== undefined };
}

function calendarDays({ calendar, inbox }: Pick<WorkspaceCalendarProps, 'calendar' | 'inbox'>) {
  // The previous inbox can still be visible while the new selection is loading.
  if (calendar === undefined) return undefined;
  return inbox === 'scheduled' ? calendar.scheduledDays ?? calendar.days : calendar.days;
}

function mergeBusinessDay(notices: Map<string, CalendarNotice>, { calendarMonth, businessDay }: {
  readonly calendarMonth: string | undefined;
  readonly businessDay: CalendarBusinessDayPreview | undefined;
}) {
  const notice = businessDay?.notice;
  if (notice !== undefined && notice.count > 0 && notice.day.slice(0, 7) === calendarMonth) {
    notices.set(notice.day, { kind: 'todo', count: notice.count });
  }
}

function monthSummary(notices: ReadonlyMap<string, CalendarNotice>, calendarMonth: string | undefined) {
  const totals = new Map<CalendarNotice['kind'], number>();
  for (const [date, notice] of notices) {
    if (date.slice(0, 7) === calendarMonth) totals.set(notice.kind, (totals.get(notice.kind) ?? 0) + notice.count);
  }
  return Array.from(totals, ([kind, count]) => ({ kind, count }));
}

function noticeQuantity({ kind, count }: CalendarNotice): string {
  return `${count}${noticeLabels[kind].unit}`;
}

function noticeCaption(notice: CalendarNotice): string {
  return `${noticeLabels[notice.kind].label} ${noticeQuantity(notice)}`;
}

function CalendarDatePicker({ selected, onDay, noticeOf, calendarMonth }: {
  readonly selected: Dayjs;
  readonly onDay: (day: Dayjs) => void;
  readonly noticeOf: CalendarNoticeOf;
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
        const notice = info.type === 'date' ? noticeOf(dateKey(dayjs(current))) : undefined;
        return notice === undefined ? info.originNode : <>{info.originNode}<span className="today-calendar-count">{noticeQuantity(notice)}</span></>;
      }}
      {...(calendarMonth === undefined ? {} : { renderExtraFooter: () => `仅显示${dayjs(calendarMonth).format('YYYY年M月')}数量` })} />
  </Flex>;
}

type CalendarGridProps = {
  readonly month: Dayjs;
  readonly selected: Dayjs;
  readonly onDay: (day: Dayjs) => void;
  readonly onBrowse: (month: Dayjs) => void;
  readonly noticeOf: CalendarNoticeOf;
  readonly monthNotices: readonly CalendarNotice[];
  readonly calendarMonth: string | undefined;
  readonly hasSchedulePreview: boolean;
};

function CalendarGrid({ month, selected, onDay, onBrowse, noticeOf, monthNotices, calendarMonth, hasSchedulePreview }: CalendarGridProps) {
  const [mode, setMode] = useState<CalendarMode>('month');
  const selection = dateKey(selected);
  const { grid, pickedDate, tabDate, focusDay } = useCalendarGridFocus({ mode, month, selected });
  const dateCellRender = (day: Dayjs) => <CalendarDay day={day} notice={noticeOf(dateKey(day))} selected={selection}
    tabDate={tabDate} onFocus={focusDay} />;
  const monthCellRender = (date: Dayjs) => <CalendarMonth month={date} active={date.isSame(month, 'month')}
    notices={date.format('YYYY-MM') === calendarMonth ? monthNotices : []} />;

  return <>
    <Calendar ref={grid} value={month} mode={mode}
      headerRender={({ value, onChange }) => <CalendarHeader month={value} mode={mode} onBrowse={onChange} onMode={setMode} />}
      styles={{ body: { paddingBlock: space[1] }, item: { paddingBlock: 0 } }}
      onSelect={(day, { source }) => {
        if (source === 'customize') onBrowse(day);
        if (source === 'month') {
          pickedDate.current = dateKey(day.isSame(selected, 'month') ? selected : day.startOf('month'));
          onBrowse(day);
          setMode('month');
        }
        if (source === 'date') {
          const date = dateKey(day);
          if (date !== selection && document.activeElement?.getAttribute('data-calendar-date') === date) pickedDate.current = date;
          onDay(day);
        }
      }}
      fullCellRender={(current, info) => info.type === 'date' ? dateCellRender(current) : monthCellRender(current)} />
    <CalendarMonthNote mode={mode} month={month} calendarMonth={calendarMonth} hasSchedulePreview={hasSchedulePreview} />
  </>;
}

function useCalendarGridFocus({ mode, month, selected }: { readonly mode: CalendarMode; readonly month: Dayjs; readonly selected: Dayjs }) {
  const monthKey = month.format('YYYY-MM');
  const selection = dateKey(selected);
  const grid = useRef<ComponentRef<typeof Calendar>>(null);
  const pickedDate = useRef<string | null>(null);
  const [focus, setFocus] = useState<{ readonly month: string; readonly selection: string; readonly date: string }>();
  const tabDate = focus?.month === monthKey && focus.selection === selection ? focus.date
    : dateKey(month.isSame(selected, 'month') ? selected : month);
  useEffect(() => {
    const key = pickedDate.current;
    if (mode !== 'month' || key === null) return;
    const button = grid.current?.nativeElement.querySelector<HTMLButtonElement>(`[data-calendar-date="${key}"]`);
    if (button == null) return;
    pickedDate.current = null;
    button.focus({ preventScroll: true });
  }, [mode, monthKey, selection]);
  return { grid, pickedDate, tabDate, focusDay: (date: string) => setFocus({ month: monthKey, selection, date }) };
}

function CalendarDay({ day, notice, selected, tabDate, onFocus }: {
  readonly day: Dayjs;
  readonly notice: CalendarNotice | undefined;
  readonly selected: string;
  readonly tabDate: string;
  readonly onFocus: (date: string) => void;
}) {
  const date = dateKey(day);
  return <Button color="default" variant="text" className="today-calendar-day today-calendar-cell" data-calendar-date={date}
    aria-label={noticeLabel(day.format('YYYY年M月D日'), notice === undefined ? [] : [notice])}
    aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
    aria-pressed={date === selected} tabIndex={date === tabDate ? undefined : -1}
    onFocus={() => onFocus(date)} onKeyDown={(event) => moveDateFocus(event, day)}>
    <span className="today-calendar-value">{day.date()}</span>
    {notice === undefined ? null : <CalendarNoticeRows notices={[notice]} />}
  </Button>;
}

function CalendarMonth({ month, active, notices }: { readonly month: Dayjs; readonly active: boolean; readonly notices: readonly CalendarNotice[] }) {
  return <Button color="default" variant="text" className="today-calendar-cell" data-calendar-month={month.format('YYYY-MM')}
    data-calendar-current={active || undefined} aria-label={noticeLabel(month.format('YYYY年M月'), notices)}>
    <span className="today-calendar-value">{month.format('M月')}</span>
    {notices.length === 0 ? null : <CalendarNoticeRows notices={notices} />}
  </Button>;
}

function noticeLabel(date: string, notices: readonly CalendarNotice[]): string {
  return [date, ...notices.map(noticeCaption)].join('，');
}

function CalendarNoticeRows({ notices }: { readonly notices: readonly CalendarNotice[] }) {
  return <span className="today-calendar-notices" aria-hidden="true">
    {notices.map((notice) => <Badge key={notice.kind} color={noticeLabels[notice.kind].color} text={noticeCaption(notice)} />)}
  </span>;
}

function CalendarMonthNote({ mode, month, calendarMonth, hasSchedulePreview }: {
  readonly mode: CalendarMode;
  readonly month: Dayjs;
  readonly calendarMonth: string | undefined;
  readonly hasSchedulePreview: boolean;
}) {
  if (mode === 'year' && calendarMonth !== undefined) {
    return <CalendarNote>{`仅汇总${dayjs(calendarMonth).format('YYYY年M月')}已加载的事项`}</CalendarNote>;
  }
  if (calendarMonth !== undefined && month.format('YYYY-MM') !== calendarMonth) return <CalendarNote>选择日期后查看该月数量</CalendarNote>;
  return hasSchedulePreview ? <CalendarNote>待办按项计，未来日期的已约跟进按批计</CalendarNote> : null;
}

function CalendarNote({ children }: { readonly children: string }) {
  return <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>{children}</Typography.Text>;
}

function CalendarHeader({ month, mode, onBrowse, onMode }: {
  readonly month: Dayjs;
  readonly mode: CalendarMode;
  readonly onBrowse: (month: Dayjs) => void;
  readonly onMode: (mode: CalendarMode) => void;
}) {
  const isYear = mode === 'year';
  const period = isYear ? 'year' : 'month';
  return <Flex className="today-calendar-heading" wrap gap="small" align="center" justify="space-between">
    <Typography.Title level={2}>工作日历</Typography.Title>
    <Flex className="today-calendar-months today-touch" align="center" gap="small" wrap>
      <Button size="small" aria-label={isYear ? '上一年' : '上月'} icon={<LeftOutlined aria-hidden />} onClick={() => onBrowse(month.subtract(1, period))} />
      <DatePicker size="small" picker={period} aria-label={isYear ? '选择日历年份' : '选择日历月份'} format={isYear ? 'YYYY年' : 'YYYY年M月'} value={month} allowClear={false}
        className="today-calendar-month-input" onChange={(next) => { if (next !== null) onBrowse(next); }} />
      <Button size="small" aria-label={isYear ? '下一年' : '下月'} icon={<RightOutlined aria-hidden />} onClick={() => onBrowse(month.add(1, period))} />
      <ViewSwitch<CalendarMode> size="small" aria-label="日历显示周期" options={calendarModes} value={mode} onChange={onMode} />
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
