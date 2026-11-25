import { AppstoreOutlined, CalendarOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Calendar, Card, DatePicker, Flex } from 'antd';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { Link } from 'react-router';
import type { TodayPaging } from '@sw/contracts';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { fontSize, text } from '../../theme/tokens.js';
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

export function WorkspaceCalendar({ calendar, date, unit, onDay, todayAdditions }: {
  readonly calendar: TodayPaging['calendar'];
  readonly date: string;
  readonly unit: '批' | '项';
  readonly onDay: (date: string) => void;
  readonly todayAdditions: { readonly day: string; readonly count: number | undefined } | undefined;
}) {
  const day = dayjs(date).locale('zh-cn');
  const counts = new Map<string, number>(calendar?.days.map(({ date, count }) => [date, count]));
  if (todayAdditions !== undefined) addToday({ counts, ...todayAdditions });
  return <Card size="small" className="today-calendar" aria-label="工作台日历">
    <Flex vertical gap="small">
      <DatePicker aria-label="选择工作日期" value={day} allowClear={false} style={{ alignSelf: 'flex-start' }}
        onChange={(selected) => { if (selected !== null) onDay(selected.format('YYYY-MM-DD')); }} />
      <Calendar value={day} fullscreen={false} onChange={(selected) => onDay(selected.format('YYYY-MM-DD'))}
        cellRender={(date, info) => {
          const count = info.type === 'date' ? counts.get(date.format('YYYY-MM-DD')) : undefined;
          return count === undefined ? null : <span style={{ display: 'block', color: text.secondary, whiteSpace: 'nowrap', fontSize: fontSize.meta }}>{count}{unit}</span>;
        }} />
    </Flex>
  </Card>;
}

function addToday({ counts, day, count }: { readonly counts: Map<string, number>; readonly day: string; readonly count: number | undefined }): void {
  if (count === undefined) counts.delete(day);
  else if (count > 0) counts.set(day, (counts.get(day) ?? 0) + count);
}
