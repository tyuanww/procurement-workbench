import { useState, type ComponentProps } from 'react';
import { CalendarOutlined, ProjectOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Flex, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { ViewSwitch } from '../../shared/ui/view-switch.js';
import { fontSize, space } from '../../theme/tokens.js';
import { TaskCalendar } from './TaskCalendar.js';
import { allTaskFilters, hasTaskFilters, matchesTaskFilters, TaskControls, type TaskFilters } from './TaskControls.js';
import { taskStyles } from './TaskStyles.js';
import { TaskBoard, TaskTable } from './TaskViews.js';
import { matchesMetric, type MetricScope, type PersonalEvent, type PersonalTask } from './workspace-model.js';

type TaskPanelProps = {
  tasks: readonly PersonalTask[];
  events: readonly PersonalEvent[];
  today: string;
  scope: MetricScope;
  onScope: (scope: MetricScope) => void;
  onOpen: (id: string) => void;
  onOpenEvent: (id: string) => void;
};

type View = 'list' | 'board' | 'calendar';
const views = [
  { value: 'list', label: '列表', icon: <UnorderedListOutlined aria-hidden /> },
  { value: 'board', label: '看板', icon: <ProjectOutlined aria-hidden /> },
  { value: 'calendar', label: '日历', icon: <CalendarOutlined aria-hidden /> },
] satisfies ComponentProps<typeof ViewSwitch<View>>['options'];

function TasksEmpty({ onClear }: { onClear: (() => void) | undefined }) {
  return (
    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={onClear ? '没有符合条件的任务。' : '暂无任务。'}>
      {onClear ? <Button onClick={onClear}>清空筛选</Button> : null}
    </Empty>
  );
}

function TaskResults({ view, month, onMonth, data, onClear }: {
  view: View;
  month: Dayjs;
  onMonth: (day: Dayjs) => void;
  data: Pick<TaskPanelProps, 'tasks' | 'events' | 'today' | 'onOpen' | 'onOpenEvent'>;
  onClear: (() => void) | undefined;
}) {
  switch (view) {
    case 'list': return <TaskTable tasks={data.tasks} onOpen={data.onOpen} empty={<TasksEmpty onClear={onClear} />} />;
    case 'board': return <TaskBoard tasks={data.tasks} onOpen={data.onOpen} />;
    case 'calendar': return <TaskCalendar data={data} month={month} onMonth={onMonth} isFiltered={onClear !== undefined} />;
  }
}

function scopeMonth({ scope, today, tasks }: Pick<TaskPanelProps, 'scope' | 'today' | 'tasks'>): Dayjs {
  if (scope === 'all') return dayjs(today);
  const scoped = tasks.filter((task) => matchesMetric(task, { scope, today }));
  const currentMonth = today.slice(0, 7);
  const firstTask = scoped.find((task) => task.due.startsWith(currentMonth)) ?? scoped[0];
  return dayjs(firstTask?.due ?? today);
}

function useTaskQuery(props: TaskPanelProps) {
  const [scope, setScope] = useState(props.scope);
  const [filters, setFilters] = useState(allTaskFilters);
  const [month, setMonth] = useState(() => scopeMonth(props));
  if (scope !== props.scope) {
    setScope(props.scope);
    setFilters(allTaskFilters);
    setMonth(scopeMonth(props));
  }
  function changeFilters(patch: Partial<TaskFilters>): void {
    const next = { ...filters, ...patch };
    setFilters(next);
    if (patch.from !== undefined || patch.to !== undefined || patch.period === 'custom') {
      const start = next.from ?? next.to;
      if (start !== null) setMonth(dayjs(start));
    }
    if (patch.period === 'today' || patch.period === 'week') setMonth(dayjs(props.today));
  }
  function clearFilters(): void {
    setFilters(allTaskFilters);
    setMonth(dayjs(props.today));
    props.onScope('all');
  }
  return { filters, month, setMonth, changeFilters, clearFilters };
}

function TaskToolbar({ view, onView, controls }: {
  view: View;
  onView: (view: View) => void;
  controls: ComponentProps<typeof TaskControls>;
}) {
  return (
    <div className="personal-task-toolbar">
      <Typography.Title className="personal-task-heading" level={2} style={{ fontSize: fontSize.section, margin: 0 }}>任务清单</Typography.Title>
      <div className="personal-task-views">
        <ViewSwitch<View> value={view} onChange={onView} options={views} aria-label="任务视图" />
      </div>
      <TaskControls {...controls} />
    </div>
  );
}

export function TaskPanel(props: TaskPanelProps) {
  const [view, setView] = useState<View>('list');
  const { filters, month, setMonth, changeFilters, clearFilters } = useTaskQuery(props);
  const tasks = props.tasks.filter((task) => matchesTaskFilters(task, { filters, scope: props.scope, today: props.today }))
    .sort((left, right) => left.due.localeCompare(right.due));
  const onClear = props.scope !== 'all' || hasTaskFilters(filters) ? clearFilters : undefined;
  const controls = {
    filters, scope: props.scope, onChange: changeFilters, onClear: view === 'list' && tasks.length === 0 ? undefined : onClear,
  };
  return (
    <Card size="small" className="personal-task-panel">
      <style>{taskStyles}</style>
      <Flex vertical gap={space[2]}>
        <TaskToolbar view={view} onView={setView} controls={controls} />
        <TaskResults view={view} month={month} onMonth={setMonth} data={{ ...props, tasks }} onClear={onClear} />
      </Flex>
    </Card>
  );
}
