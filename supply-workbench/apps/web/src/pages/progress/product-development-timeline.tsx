import { Button, Empty, Segmented, Space, Typography } from 'antd';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ProductDevelopmentNode, ProductDevelopmentProject } from '@sw/contracts';
import { DEVELOPMENT_DESTINATION_LABELS, type LocalDate } from '@sw/domain';
import { scheduleBarOf, scheduleDays, scheduleWindow, shiftScheduleWindow, todayPercent, type ScheduleScale, type Timeline } from '../../features/progress/index.js';
import { workItemStatusLabel } from '../../features/today/index.js';
import { ScheduleTimeline } from './progress-timeline.js';

export function DevelopmentTimeline({ project, businessDate, onOpen }: {
  readonly project: ProductDevelopmentProject; readonly businessDate: LocalDate; readonly onOpen: (nodeId: string) => void;
}): ReactNode {
  const [scale, setScale] = useState<ScheduleScale>('month');
  const [anchor, setAnchor] = useState(businessDate);
  const window = scheduleWindow({ scale, anchor });
  const visible = project.nodes.filter((node) => node.plannedStart <= window.to && node.plannedEnd >= window.from);
  const timeline: Timeline = {
    days: scheduleDays({ window, today: businessDate, scale }), todayPercent: todayPercent({ window, today: businessDate }), total: visible.length,
    groups: [{
      key: project.id, name: project.title, counts: `${visible.length} 个节点`, isUnassigned: false,
      rows: visible.map((node) => ({
        id: node.id, workItemId: node.id, title: node.title,
        meta: `${DEVELOPMENT_DESTINATION_LABELS[node.destination]} · ${node.ownerName ?? '未分配'}`,
        when: `${node.plannedStart} 至 ${node.plannedEnd} · ${workItemStatusLabel(node.status)}`,
        bar: scheduleBarOf({ ...node, overdueDays: node.daysUntilRequired === null ? null : -node.daysUntilRequired }, window),
      })),
    }],
  };
  return <Space orientation="vertical" size="middle" style={{ display: 'flex' }}>
    <Space wrap>
      <Segmented value={scale} options={[{ label: '周', value: 'week' }, { label: '月', value: 'month' }]}
        onChange={(value) => setScale(value === 'week' ? 'week' : 'month')} />
      <Button onClick={() => setAnchor(shiftScheduleWindow({ scale, window, direction: -1 }).from)}>上一期</Button>
      <Button onClick={() => setAnchor(businessDate)}>本期</Button>
      <Button onClick={() => setAnchor(shiftScheduleWindow({ scale, window, direction: 1 }).from)}>下一期</Button>
      <Typography.Text type="secondary">{window.from} 至 {window.to}</Typography.Text>
    </Space>
    {visible.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本期暂无开发节点" /> :
      <ScheduleTimeline timeline={timeline} scale={scale} columnLabel="开发节点 · 交付目的 · 负责人" hint="点击任务条查看节点详情。" onOpen={onOpen} />}
  </Space>;
}

export function countdownOf(node: ProductDevelopmentNode): string {
  const days = node.daysUntilRequired;
  if (days === null) return workItemStatusLabel(node.status);
  if (days < 0) return `已逾期 ${-days} 天`;
  if (days === 0) return '今日到期';
  return `距要求日期 ${days} 天`;
}
