import { CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Calendar, Flex, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { space } from '../../theme/tokens.js';
import { TaskDue, TaskLink, type TaskViewProps } from './TaskViews.js';
import type { PersonalEvent, PersonalTask } from './workspace-model.js';

type CalendarEntry = { kind: 'task'; item: PersonalTask } | { kind: 'event'; item: PersonalEvent };
type CalendarTaskProps = TaskViewProps & {
  events: readonly PersonalEvent[];
  today: string;
  onOpenEvent: (id: string) => void;
};
type CalendarOpeners = { task: TaskViewProps['onOpen']; event: CalendarTaskProps['onOpenEvent'] };

function addEntry(byDay: Map<string, CalendarEntry[]>, entry: CalendarEntry): void {
  const day = entry.kind === 'task' ? entry.item.due : entry.item.start.slice(0, 10);
  const entries = byDay.get(day) ?? [];
  entries.push(entry);
  byDay.set(day, entries);
}

function groupByDate({ tasks, events }: Pick<CalendarTaskProps, 'tasks' | 'events'>): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  tasks.forEach((item) => addEntry(byDay, { kind: 'task', item }));
  [...events].sort((left, right) => left.start.localeCompare(right.start))
    .forEach((item) => addEntry(byDay, { kind: 'event', item }));
  return byDay;
}

function CalendarItems({ entries, openers, compact = false }: { entries: CalendarEntry[]; openers: CalendarOpeners; compact?: boolean }) {
  return (
    <ul className="personal-task-items" role="list">
      {entries.map(({ kind, item }) => (
        <li key={`${kind}:${item.id}`} className="personal-task-calendar-entry">
          {kind === 'event' ? <CalendarOutlined aria-label="日程" /> : null}
          <TaskLink task={item} onOpen={openers[kind]} compact={compact} />
        </li>
      ))}
    </ul>
  );
}

function CalendarMonthControls({ month, today, onChange }: { month: Dayjs; today: string; onChange: (month: Dayjs) => void }) {
  return (
    <Flex className="personal-task-calendar-controls" align="center" justify="space-between" gap={space[1]} wrap>
      <Typography.Text strong aria-live="polite">{month.format('YYYY年M月')}</Typography.Text>
      <Flex gap={space[0]}>
        <Button icon={<LeftOutlined />} aria-label="上个月" onClick={() => onChange(month.subtract(1, 'month').startOf('month'))} />
        <Button onClick={() => onChange(dayjs(today))}>今天</Button>
        <Button icon={<RightOutlined />} aria-label="下个月" onClick={() => onChange(month.add(1, 'month').startOf('month'))} />
      </Flex>
    </Flex>
  );
}

function CalendarAgenda({ days, openers }: { days: [string, CalendarEntry[]][]; openers: CalendarOpeners }) {
  return (
    <div className="personal-task-calendar-agenda">
      {days.map(([day, entries]) => (
        <section key={day} className="personal-task-agenda-day">
          <Typography.Title level={3} style={{ margin: 0 }}><TaskDue due={day} /></Typography.Title>
          <CalendarItems entries={entries} openers={openers} />
        </section>
      ))}
    </div>
  );
}

export function TaskCalendar({ data, month, onMonth, isFiltered }: {
  data: CalendarTaskProps;
  month: Dayjs;
  onMonth: (day: Dayjs) => void;
  isFiltered: boolean;
}) {
  const byDay = groupByDate({ tasks: data.tasks, events: isFiltered ? [] : data.events });
  const days = [...byDay].filter(([day]) => day.startsWith(month.format('YYYY-MM-'))).sort(([left], [right]) => left.localeCompare(right));
  const openers = { task: data.onOpen, event: data.onOpenEvent };
  return (
    <>
      <CalendarMonthControls today={data.today} month={month} onChange={onMonth} />
      {days.length === 0 ? (
        <Typography.Text type="secondary" role="status">
          {isFiltered ? '本月没有符合条件的任务' : '本月暂无任务或日程'}
        </Typography.Text>
      ) : null}
      <div className="personal-task-calendar-grid">
        <Calendar
          value={month}
          headerRender={() => null}
          onChange={onMonth}
          cellRender={(date) => {
            const entries = byDay.get(date.format('YYYY-MM-DD'));
            return entries === undefined ? null : <CalendarItems entries={entries} openers={openers} compact />;
          }}
        />
      </div>
      {days.length === 0 ? null : <CalendarAgenda days={days} openers={openers} />}
    </>
  );
}
