import { CheckOutlined, ClockCircleOutlined, MinusCircleOutlined, StopOutlined, SyncOutlined } from '@ant-design/icons';
import { Tag } from 'antd';
import type { CSSProperties, ReactNode } from 'react';
import {
  workItemStatusLabel,
  workItemStatusTone,
  type TaskTag,
  type TaskTone,
  type WorkItemStatus,
} from '../today/index.js';
import { statusColor } from '../../theme/tokens.js';

export function TaskTagView({ tag }: { readonly tag: TaskTag }): ReactNode {
  return <Tag style={tagStyle({ tone: tag.tone, fill: tag.fill })}>{tag.label}</Tag>;
}

export function WorkItemStatusTag({ status }: { readonly status: WorkItemStatus }): ReactNode {
  return <Tag style={tagStyle({ tone: workItemStatusTone(status), fill: 'solid' })}>{statusIcon(status)} {workItemStatusLabel(status)}</Tag>;
}

export function tagStyle(input: { readonly tone: TaskTone; readonly fill: 'solid' | 'outline' }): CSSProperties {
  const color = statusColor[input.tone];
  return {
    marginInlineEnd: 0,
    color: color.text,
    background: input.fill === 'solid' ? color.bg : 'transparent',
    borderColor: input.fill === 'solid' ? color.border : color.text,
  };
}

function statusIcon(status: WorkItemStatus): ReactNode {
  if (status === 'planned') return <ClockCircleOutlined aria-hidden />;
  if (status === 'in_progress') return <SyncOutlined aria-hidden />;
  if (status === 'blocked') return <StopOutlined aria-hidden />;
  if (status === 'done') return <CheckOutlined aria-hidden />;
  return <MinusCircleOutlined aria-hidden />;
}
