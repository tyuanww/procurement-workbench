import { useId } from 'react';
import { Button, DatePicker, Flex, Select, Tag } from 'antd';
import { localDate, weekStart } from '@sw/domain';
import dayjs from 'dayjs';
import { space } from '../../theme/tokens.js';
import { matchesMetric, shiftDay, type MetricScope, type PersonalTask } from './workspace-model.js';

export const taskPriorityLabel = { high: '高优先级', normal: '中优先级', low: '低优先级' } satisfies Record<PersonalTask['priority'], string>;
export const taskStatusLabel = { todo: '待办', doing: '进行中', done: '已完成' } satisfies Record<PersonalTask['status'], string>;
const scopeLabel = { due: '今日待办', soon: '即将到期', done: '本周完成' } satisfies Record<Exclude<MetricScope, 'all'>, string>;

type TaskPeriod = 'all' | 'today' | 'week' | 'overdue' | 'custom';
export type TaskFilters = {
  period: TaskPeriod;
  from: string | null;
  to: string | null;
  priority: PersonalTask['priority'] | 'all';
  status: PersonalTask['status'] | 'all';
};

export const allTaskFilters: TaskFilters = { period: 'all', from: null, to: null, priority: 'all', status: 'all' };

export function hasTaskFilters({ period, priority, status }: TaskFilters): boolean {
  return period !== 'all' || priority !== 'all' || status !== 'all';
}

function matchesDateRange(due: string, { from, to }: Pick<TaskFilters, 'from' | 'to'>): boolean {
  return (from === null || due >= from) && (to === null || due <= to);
}

function matchesTaskPeriod(task: PersonalTask, { filters, today }: { filters: TaskFilters; today: string }): boolean {
  switch (filters.period) {
    case 'all': return true;
    case 'today': return task.due === today;
    case 'week': {
      const monday = weekStart(localDate(today));
      return task.due >= monday && task.due <= shiftDay(monday, 6);
    }
    case 'overdue': return task.status !== 'done' && task.due < today;
    case 'custom': return matchesDateRange(task.due, filters);
  }
}

export function matchesTaskFilters(task: PersonalTask, input: { filters: TaskFilters; scope: MetricScope; today: string }): boolean {
  const { priority, status } = input.filters;
  return matchesMetric(task, input)
    && matchesTaskPeriod(task, input)
    && (priority === 'all' || task.priority === priority)
    && (status === 'all' || task.status === status);
}

type DateFilterProps = {
  date: 'from' | 'to';
  filters: TaskFilters;
  onChange: (patch: Partial<TaskFilters>) => void;
};

function TaskDateFilter({ date, filters, onChange }: DateFilterProps) {
  const id = useId();
  const label = date === 'from' ? '开始日期' : '结束日期';
  const value = filters[date];
  const minDate = date === 'to' && filters.from !== null ? dayjs(filters.from) : undefined;
  const maxDate = date === 'from' && filters.to !== null ? dayjs(filters.to) : undefined;
  return (
    <>
      <label htmlFor={id} className="personal-task-label">{label}</label>
      <DatePicker
        id={id}
        className="personal-task-date-filter"
        format="YYYY-MM-DD"
        value={value === null ? null : dayjs(value)}
        {...(minDate === undefined ? {} : { minDate })}
        {...(maxDate === undefined ? {} : { maxDate })}
        placeholder={label}
        onChange={(day) => onChange({ [date]: day?.format('YYYY-MM-DD') ?? null })}
      />
    </>
  );
}

type TaskControlsProps = {
  filters: TaskFilters;
  scope: MetricScope;
  onChange: (patch: Partial<TaskFilters>) => void;
  onClear: (() => void) | undefined;
};

function TaskPeriodControls({ filters, onChange }: Pick<TaskControlsProps, 'filters' | 'onChange'>) {
  return (
    <>
      <Select<TaskPeriod>
        aria-label="截止日期"
        value={filters.period}
        options={[
          { value: 'all', label: '全部日期' },
          { value: 'today', label: '今天' },
          { value: 'week', label: '本周' },
          { value: 'overdue', label: '逾期' },
          { value: 'custom', label: '自定义日期' },
        ]}
        onChange={(period) => onChange({ period })}
      />
      {filters.period === 'custom' ? (
        <Flex wrap gap={space[1]} role="group" aria-label="截止日期范围">
          <TaskDateFilter date="from" filters={filters} onChange={onChange} />
          <TaskDateFilter date="to" filters={filters} onChange={onChange} />
        </Flex>
      ) : null}
    </>
  );
}

export function TaskControls({ filters, scope, onChange, onClear }: TaskControlsProps) {
  return (
    <Flex wrap align="center" gap={space[1]} className="personal-task-filters" role="group" aria-label="任务筛选">
      <TaskPeriodControls filters={filters} onChange={onChange} />
      <Select<TaskFilters['priority']>
        aria-label="优先级"
        value={filters.priority}
        options={[
          { value: 'all', label: '全部优先级' },
          { value: 'high', label: taskPriorityLabel.high },
          { value: 'normal', label: taskPriorityLabel.normal },
          { value: 'low', label: taskPriorityLabel.low },
        ]}
        onChange={(priority) => onChange({ priority })}
      />
      <Select<TaskFilters['status']>
        aria-label="状态"
        value={filters.status}
        options={[
          { value: 'all', label: '全部状态' },
          { value: 'todo', label: taskStatusLabel.todo },
          { value: 'doing', label: taskStatusLabel.doing },
          { value: 'done', label: taskStatusLabel.done },
        ]}
        onChange={(status) => onChange({ status })}
      />
      {scope === 'all' ? null : <Tag>{scopeLabel[scope]}</Tag>}
      {onClear === undefined ? null : <Button type="text" onClick={onClear}>清空筛选</Button>}
    </Flex>
  );
}
