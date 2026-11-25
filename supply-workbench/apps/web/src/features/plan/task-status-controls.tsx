import { Button, Flex, Radio, Space, Typography } from 'antd';
import { useId, type ReactNode } from 'react';
import { useCanWrite } from '../../shared/actor.js';
import { fontSize, space } from '../../theme/tokens.js';
import {
  canCancel,
  canSetStatus,
  drawerStatusOptions,
  isWorkItemStatus,
  workItemStatusLabel,
  type WorkItemStatus,
} from '../today/index.js';
import { confirmText, isStatusLocked, type StatusFlow } from './model/task-status-flow.js';
import { WorkItemStatusTag } from './task-tag.js';

export function TaskStatusEditor(props: {
  readonly status: WorkItemStatus;
  readonly flow: StatusFlow;
  readonly onRequest: (status: WorkItemStatus) => void;
  readonly onCancel: () => void;
  readonly onCommit: () => void;
}): ReactNode {
  const isLocked = isStatusLocked(props.flow);
  return (
    <div>
      <StatusPicker status={props.status} isLocked={isLocked} saving={props.flow.kind === 'submitting'} onRequest={props.onRequest} />
      {props.flow.kind === 'confirming' ? (
        <StatusConfirm from={props.flow.from} to={props.flow.to} onCancel={props.onCancel} onCommit={props.onCommit} />
      ) : null}
    </div>
  );
}

function StatusPicker(props: {
  readonly status: WorkItemStatus;
  readonly isLocked: boolean;
  readonly saving: boolean;
  readonly onRequest: (status: WorkItemStatus) => void;
}): ReactNode {
  const groupName = useId();
  const options = drawerStatusOptions().map((status) => ({
    value: status,
    label: workItemStatusLabel(status),
    disabled: props.isLocked || (status !== props.status && !canSetStatus(props.status, status)),
  }));
  return (
    <div>
      <Space size={space[1]} style={{ marginBottom: space[1] }}>
        <Typography.Text strong>状态</Typography.Text>
        <WorkItemStatusTag status={props.status} />
        {props.saving ? <Typography.Text type="secondary" style={{ fontSize: fontSize.meta }}>保存中</Typography.Text> : null}
      </Space>
      <Radio.Group
        aria-label="更改任务状态"
        name={groupName}
        style={{ display: 'flex', flexWrap: 'wrap', gap: space[0] }}
        disabled={props.isLocked}
        value={props.status}
        options={options}
        onChange={(event) => {
          const value: unknown = event.target.value;
          if (typeof value === 'string' && isWorkItemStatus(value)) props.onRequest(value);
        }}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: space[1], fontSize: fontSize.meta }}>
        只允许计划中到进行中，进行中到阻塞或已完成，阻塞回到进行中，任意状态到已取消。
      </Typography.Paragraph>
    </div>
  );
}

function StatusConfirm(props: {
  readonly from: WorkItemStatus;
  readonly to: WorkItemStatus;
  readonly onCancel: () => void;
  readonly onCommit: () => void;
}): ReactNode {
  return (
    <Flex justify="space-between" align="center" gap={space[2]} wrap style={{ marginTop: space[2] }}>
      <Typography.Text>{confirmText(props)}</Typography.Text>
      <Space>
        <Button onClick={props.onCancel}>先不改</Button>
        <Button type="primary" onClick={props.onCommit}>确认更改</Button>
      </Space>
    </Flex>
  );
}

export function TaskActionBar(props: {
  readonly status: WorkItemStatus | null;
  readonly isSaving: boolean;
  readonly isLocked?: boolean;
  readonly onClose: () => void;
  readonly onChange: (status: WorkItemStatus) => void;
}): ReactNode {
  const canRecord = useCanWrite('records.write');
  const isLocked = props.isLocked === true || props.isSaving;
  return (
    <Flex justify="flex-end" wrap gap={space[1]}>
      <Button onClick={props.onClose}>关闭</Button>
      {canRecord && props.status !== null && canCancel(props.status) ? (
        <Button danger loading={props.isSaving} disabled={isLocked} onClick={() => props.onChange('cancelled')}>取消任务</Button>
      ) : null}
      {canRecord && props.status !== null ? <DoneButton status={props.status} isSaving={props.isSaving} isLocked={isLocked} onChange={props.onChange} /> : null}
    </Flex>
  );
}

function DoneButton(props: {
  readonly status: WorkItemStatus;
  readonly isSaving: boolean;
  readonly isLocked: boolean;
  readonly onChange: (status: WorkItemStatus) => void;
}): ReactNode {
  return (
    <Button
      type="primary"
      loading={props.isSaving}
      disabled={props.isLocked || !canSetStatus(props.status, 'done')}
      onClick={() => props.onChange('done')}
    >
      标记完成
    </Button>
  );
}
