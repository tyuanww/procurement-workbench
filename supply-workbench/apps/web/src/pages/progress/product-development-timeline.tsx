import { Empty, Flex } from 'antd';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type { ProductDevelopmentNode, ProductDevelopmentProject } from '@sw/contracts';
import { DEVELOPMENT_DESTINATION_LABELS, type LocalDate } from '@sw/domain';
import { scheduleBarOf, scheduleDays, scheduleWindow, todayPercent, type ScheduleScale, type Timeline } from '../../features/progress/index.js';
import { workItemStatusLabel } from '../../features/today/index.js';
import { useShellViewport } from '../../features/shell/index.js';
import { space } from '../../theme/tokens.js';
import { ScheduleList, ScheduleTimeline } from './progress-timeline.js';
import { ScheduleWindowControls } from './schedule-window-controls.js';

export function DevelopmentTimeline({ project, businessDate, onOpen }: {
  readonly project: ProductDevelopmentProject; readonly businessDate: LocalDate; readonly onOpen: (nodeId: string) => void;
}): ReactNode {
  const isPhone = useShellViewport().band === 'phone';
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
  return <Flex vertical gap={space[2]}>
    <ScheduleWindowControls label="开发排期刻度" scale={scale} window={window} today={businessDate} onScale={setScale} onAnchor={setAnchor} />
    {visible.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="本期暂无开发节点" /> :
      isPhone ? <ScheduleList timeline={timeline} onOpen={onOpen} /> :
        <ScheduleTimeline timeline={timeline} scale={scale} columnLabel="开发节点 · 交付目的 · 负责人" hint="点击任务条查看节点详情。" onOpen={onOpen} />}
  </Flex>;
}

export function countdownOf(node: ProductDevelopmentNode): string {
  const days = node.daysUntilRequired;
  if (days === null) return workItemStatusLabel(node.status);
  if (days < 0) return `已逾期 ${-days} 天`;
  if (days === 0) return '今日到期';
  return `距要求日期 ${days} 天`;
}
