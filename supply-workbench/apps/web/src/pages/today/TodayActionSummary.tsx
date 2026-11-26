import { Button, Card, Flex } from 'antd';
import { MetricStrip, type MetricItem } from '../../shared/ui/analytics.js';
import { arrivalShortcutPath } from '../../features/today/index.js';
import type { ActionPageControls } from './ActionControls.js';

export function TodayActionSummary({ page, search, onArrivals, onPending }: {
  readonly page: ActionPageControls;
  readonly search: string;
  readonly onArrivals: (path: string) => void;
  readonly onPending: () => void;
}) {
  const { paging, work } = page;
  const items: readonly MetricItem[] = [
    { key: 'chase', label: '工厂催货', value: paging.chaseCounts?.all ?? '—', unit: ' 批',
      action: { isActive: work === 'factory_chase', select: () => page.onWork(work === 'factory_chase' ? undefined : 'factory_chase') } },
    { key: 'arrivals', label: '到仓待收', value: paging.arrivalCount ?? '—', unit: ' 批',
      action: { select: () => onArrivals(arrivalShortcutPath({ returnSearch: search })) } },
    { key: 'notes', label: '内部等回单', value: paging.internalNoteCount ?? '—', unit: ' 批',
      action: { isActive: work === 'internal_note', select: () => page.onWork(work === 'internal_note' ? undefined : 'internal_note') } },
    { key: 'pending', label: '待建批次', value: paging.pendingCount ?? '—', unit: ' 行',
      ...(paging.pendingCount ? { action: { select: onPending } } : {}) },
  ];
  return <div className="today-action-summary"><MetricStrip items={items} ariaLabel="行动摘要" compact /></div>;
}

export function TodayActionShortcuts({ overdue, followUp, planCount, onOverdue, onFollowUp, onPlan }: {
  readonly overdue: number;
  readonly followUp: number;
  readonly planCount: number | undefined;
  readonly onOverdue: () => void;
  readonly onFollowUp: () => void;
  readonly onPlan: () => void;
}) {
  if (overdue === 0 && followUp === 0 && !planCount) return null;
  return <aside className="today-action-shortcuts" aria-label="快捷定位">
    <Card size="small" title="快捷定位">
      <Flex vertical gap="small" className="today-touch">
        {overdue === 0 ? null : <Button onClick={onOverdue}>未发逾期</Button>}
        {followUp === 0 ? null : <Button onClick={onFollowUp}>到时跟进</Button>}
        {!planCount ? null : <Button onClick={onPlan}>我的到期排期 {planCount} 项</Button>}
      </Flex>
    </Card>
  </aside>;
}
