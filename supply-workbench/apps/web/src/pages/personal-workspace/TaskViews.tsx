import { CalendarOutlined, CheckOutlined, ClockCircleOutlined, FlagOutlined } from '@ant-design/icons';
import { Button, Flex, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { useId, type MouseEvent, type ReactNode } from 'react';
import { fontSize, space, statusColor } from '../../theme/tokens.js';
import { taskPriorityLabel, taskStatusLabel } from './TaskControls.js';
import type { PersonalTask } from './workspace-model.js';

export type TaskViewProps = { tasks: readonly PersonalTask[]; onOpen: (id: string) => void };

const statuses = ['todo', 'doing', 'done'] satisfies PersonalTask['status'][];
const statusIcon = { todo: CalendarOutlined, doing: ClockCircleOutlined, done: CheckOutlined };
const statusTone = { todo: statusColor.neutral, doing: statusColor.info, done: statusColor.success };
const priorityTone = { high: statusColor.attention, normal: statusColor.neutral, low: statusColor.neutral };

function priorityTag(priority: PersonalTask['priority']) {
  const tone = priorityTone[priority];
  return <Tag icon={<FlagOutlined aria-hidden />} style={{ color: tone.text, background: tone.bg, borderColor: tone.border }}>{taskPriorityLabel[priority]}</Tag>;
}

function taskStatusTag(status: PersonalTask['status']) {
  const tone = statusTone[status];
  const Icon = statusIcon[status];
  return <Tag icon={<Icon aria-hidden />} style={{ color: tone.text, background: tone.bg, borderColor: tone.border }}>{taskStatusLabel[status]}</Tag>;
}

export function TaskLink({ task, onOpen, compact }: { task: Pick<PersonalTask, 'id' | 'title'>; onOpen: TaskViewProps['onOpen']; compact?: boolean }) {
  function openTask(event: MouseEvent<HTMLElement>): void {
    event.stopPropagation();
    onOpen(task.id);
  }
  return (
    <Button
      type="link"
      data-workspace-entry={task.id}
      className={compact === true ? 'personal-task-link personal-task-link-compact' : 'personal-task-link'}
      title={compact === true ? task.title : undefined}
      onClick={openTask}
    >
      {task.title}
    </Button>
  );
}

function taskColumns(onOpen: TaskViewProps['onOpen']): TableColumnsType<PersonalTask> {
  return [
    { title: '任务名称', rowScope: 'row', dataIndex: 'title', render: (_value: string, task) => (
      <Flex vertical align="start" gap={space[0]}>
        <TaskLink task={task} onOpen={onOpen} />
        {task.description === '' ? null : <Typography.Text type="secondary" className="personal-task-summary"
          style={{ fontSize: fontSize.meta }}>{task.description}</Typography.Text>}
      </Flex>
    ) },
    { title: '优先级', dataIndex: 'priority', render: priorityTag, responsive: ['md'], width: 108 },
    { title: '状态', dataIndex: 'status', render: taskStatusTag, responsive: ['md'], width: 104 },
    { title: '截止日期', dataIndex: 'due', render: (due: string) => <TaskDue due={due} />, width: 102 },
  ];
}

export function TaskDue({ due }: { due: string }) {
  return <time dateTime={due} className="personal-task-due">{due}</time>;
}

export function TaskTable({ tasks, onOpen, empty }: TaskViewProps & { empty: ReactNode }) {
  return (
    <Table<PersonalTask>
      size="small"
      tableLayout="fixed"
      rowKey="id"
      dataSource={tasks}
      columns={taskColumns(onOpen)}
      locale={{ emptyText: empty }}
      pagination={tasks.length > 50 ? { defaultPageSize: 50, placement: ['bottomEnd'], showSizeChanger: false } : false}
    />
  );
}

function TaskBoardItem({ task, onOpen }: { task: PersonalTask; onOpen: TaskViewProps['onOpen'] }) {
  const id = useId();
  return (
    <Button
      className="personal-task-board-card"
      data-workspace-entry={task.id}
      aria-labelledby={id}
      aria-describedby={`${id}-priority ${id}-due`}
      onClick={() => onOpen(task.id)}
    >
      <span id={`${id}-priority`}>{priorityTag(task.priority)}</span>
      <span id={id} className="personal-task-card-title">{task.title}</span>
      <Typography.Text id={`${id}-due`} type="secondary" className="personal-task-card-date">
        <CalendarOutlined aria-hidden /> <TaskDue due={task.due} />
      </Typography.Text>
    </Button>
  );
}

function TaskLane({ status, tasks, onOpen }: TaskViewProps & { status: PersonalTask['status'] }) {
  const tone = statusTone[status];
  const Icon = statusIcon[status];
  return (
    <section className="personal-task-lane">
      <Typography.Title level={3} className="personal-task-lane-title" style={{ color: tone.text, margin: 0, fontSize: fontSize.section }}>
        <Icon aria-hidden /> {taskStatusLabel[status]} <Typography.Text type="secondary">{tasks.length}</Typography.Text>
      </Typography.Title>
      {tasks.length === 0 ? null : (
        <ul className="personal-task-items" role="list">
          {tasks.map((task) => <li key={task.id}><TaskBoardItem task={task} onOpen={onOpen} /></li>)}
        </ul>
      )}
    </section>
  );
}

export function TaskBoard({ tasks, onOpen }: TaskViewProps) {
  return (
    <div className="personal-task-board">
      {statuses.map((status) => <TaskLane key={status} status={status} tasks={tasks.filter((task) => task.status === status)} onOpen={onOpen} />)}
    </div>
  );
}
