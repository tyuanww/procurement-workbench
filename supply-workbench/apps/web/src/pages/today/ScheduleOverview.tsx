import type { ReactNode } from 'react';
import type { PlanRow } from '../../features/today/index.js';
import { MetricStrip, type MetricItem } from '../../shared/ui/analytics.js';
import { WorkspaceAssistant } from './WorkspaceAssistant.js';
import { focusSection, workspaceRowId } from './today-focus.js';
import { matchesScheduleFilter, type ScheduleFilter } from './schedule-filter.js';

export type ScheduleSelection = {
  readonly filter: ScheduleFilter | undefined;
  readonly onFilter?: (filter: ScheduleFilter | undefined) => void;
};

export function ScheduleOverview({ rows, completeRows, children, selection, onOpen }: {
  readonly rows: readonly PlanRow[];
  readonly completeRows: readonly PlanRow[];
  readonly children: ReactNode;
  readonly selection: ScheduleSelection;
  readonly onOpen: (id: string) => void;
}) {
  const metrics = scheduleMetrics(completeRows, selection);
  const shortcuts = scheduleShortcuts({ pending: rows, overdue: rows.find((row) => row.timing === 'overdue'),
    blocked: rows.find((row) => row.status === 'blocked'), dueToday: rows.find((row) => row.timing === 'today'), onOpen });
  return <div className="today-schedule-overview">
    <div className="today-action-summary"><MetricStrip items={metrics} ariaLabel="排期摘要" compact /></div>
    <div className="today-actions-layout">
      {children}
      {shortcuts.length === 0 ? null : <WorkspaceAssistant title="排期助手" hint={shortcuts[0]?.hint ?? null} shortcuts={shortcuts} />}
    </div>
  </div>;
}

function scheduleMetrics(rows: readonly PlanRow[], { filter, onFilter }: ScheduleSelection): readonly MetricItem[] {
  const measures: readonly { readonly field?: ScheduleFilter; readonly label: string; readonly tone: NonNullable<MetricItem['tone']> }[] = [
    { label: '到期未完成', tone: 'neutral' },
    { field: 'overdue', label: '已逾期', tone: 'danger' },
    { field: 'today', label: '今日到期', tone: 'warning' },
    { field: 'blocked', label: '已阻塞', tone: 'attention' },
  ];
  return measures.map(({ field, label, tone }) => {
    const value = rows.filter((row) => matchesScheduleFilter(row, field)).length;
    const isActive = filter === field;
    return { key: field ?? 'pending', label, value, unit: ' 项', tone,
      ...(onFilter !== undefined && (value > 0 || isActive) ? { action: { isActive, select: () => onFilter(isActive ? undefined : field) } } : {}) };
  });
}

function scheduleShortcuts({ pending, overdue, blocked, dueToday, onOpen }: {
  readonly pending: readonly PlanRow[];
  readonly overdue: PlanRow | undefined;
  readonly blocked: PlanRow | undefined;
  readonly dueToday: PlanRow | undefined;
  readonly onOpen: (id: string) => void;
}) {
  const locate = (row: PlanRow) => focusSection(workspaceRowId(row.id));
  const shortcuts = [];
  if (overdue) shortcuts.push({ label: '定位逾期任务', hint: '先与负责人核对逾期任务的进展。', run: () => locate(overdue) });
  if (blocked) shortcuts.push({ label: '查看受阻任务详情', hint: '先查看受阻任务的处理记录和前置依赖。', run: () => {
    locate(blocked);
    onOpen(blocked.id);
  } });
  const urgent = pending.find((row) => row.isHighPriority && row.id !== overdue?.id && row.id !== blocked?.id);
  if (urgent) shortcuts.push({ label: '定位高优先任务', hint: '先跟进高优先级任务。', run: () => locate(urgent) });
  if (shortcuts.length === 0 && dueToday) {
    shortcuts.push({ label: '定位今日到期任务', hint: '先核对今日到期任务的完成进展。', run: () => locate(dueToday) });
  }
  return shortcuts;
}
