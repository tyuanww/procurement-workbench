import { Alert, Button, Descriptions, Drawer, Flex, Result, Skeleton } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import { useCanWrite } from '../../shared/actor.js';
import {
  ownerText,
  plannedRangeText,
  supplierText,
  workItemSourceLabel,
  type WorkItemDetail,
  type WorkItemStatus,
} from '../today/index.js';
import { drawerWide, fontSize, space, statusColor } from '../../theme/tokens.js';
import { loadWorkItem } from './api.js';
import { TaskDependencyWarning } from './dependency-warning.js';
import { WorkItemEventHistory } from './event-history.js';
import { isStatusLocked, statusFeedback } from './model/task-status-flow.js';
import { TaskActionBar, TaskStatusEditor } from './task-status-controls.js';
import { TaskTagView } from './task-tag.js';
import { useTaskStatusChange, type TaskStatusChange } from './use-task-status-change.js';

export { TaskActionBar };

type DetailLoad =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly detail: WorkItemDetail }
  | { readonly kind: 'error'; readonly message: string };

export type TaskDrawerProps = {
  readonly workItemId: string | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onChanged: () => void;
};

export function TaskDrawer(props: TaskDrawerProps): ReactNode {
  const data = useTaskDetail({ workItemId: props.workItemId, isOpen: props.isOpen });
  const ready = data.load.kind === 'ready' ? data.load.detail.item : null;
  const change = useTaskStatusChange({
    status: ready === null ? null : ready.status,
    detailId: ready === null ? null : ready.id,
    onReload: data.reload,
    onChanged: props.onChanged,
  });
  return (
    <Drawer
      placement="right"
      size={drawerWide}
      open={props.isOpen}
      onClose={props.onClose}
      title={drawerTitle(data.load)}
      footer={footerOf({ status: ready === null ? null : ready.status, change, onClose: props.onClose })}
    >
      <DrawerBody load={data.load} change={change} onRetry={data.reload} />
    </Drawer>
  );
}

function useTaskDetail(input: { readonly workItemId: string | null; readonly isOpen: boolean }): {
  readonly load: DetailLoad;
  readonly reload: () => void;
} {
  const [load, setLoad] = useState<DetailLoad>({ kind: 'idle' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!input.isOpen || input.workItemId === null) return;
    let isActive = true;
    setLoad((current) => (current.kind === 'ready' ? current : { kind: 'loading' }));
    void loadWorkItem(input.workItemId)
      .then((detail) => { if (isActive) setLoad({ kind: 'ready', detail }); })
      .catch((error: unknown) => {
        if (!isActive) return;
        const failure = readFailureOf(error);
        if (failure === null) return;
        setLoad({ kind: 'error', message: failureText(failure) });
      });
    return () => { isActive = false; };
  }, [input.workItemId, input.isOpen, reload]);
  return { load, reload: () => setReload((value) => value + 1) };
}

function DrawerBody(props: { readonly load: DetailLoad; readonly change: TaskStatusChange; readonly onRetry: () => void }): ReactNode {
  if (props.load.kind === 'idle' || props.load.kind === 'loading') return <Skeleton active paragraph={{ rows: 6 }} />;
  if (props.load.kind === 'error') return <Result status="error" title="任务没有读出来" subTitle={props.load.message} extra={<Button type="primary" onClick={props.onRetry}>重试</Button>} />;
  return <TaskDetail detail={props.load.detail} change={props.change} />;
}

function TaskDetail(props: { readonly detail: WorkItemDetail; readonly change: TaskStatusChange }): ReactNode {
  const canRecord = useCanWrite('records.write');
  const item = props.detail.item;
  const feedback = statusFeedback(props.change.flow);
  return (
    <>
      {canRecord ? <Alert style={{ marginBottom: space[3] }} type="info" showIcon title="来源排期任务。改状态后写入事件历史，今日列表和进度总排期同时刷新。" /> : null}
      <TaskDependencyWarning detail={props.detail} />
      {feedback === null ? null : <Alert style={{ marginBottom: space[3] }} type={feedback.tone} showIcon title={feedback.text} />}
      {canRecord ? (
        <TaskStatusEditor
          status={item.status}
          flow={props.change.flow}
          onRequest={props.change.request}
          onCancel={props.change.cancel}
          onCommit={props.change.commit}
        />
      ) : null}
      <Descriptions
        size="small"
        column={1}
        style={{ marginTop: space[3] }}
        items={[
          { key: 'when', label: '计划起止', children: plannedRangeText(item, item.plannedStart) },
          { key: 'owner', label: '负责人', children: ownerText(item) },
          { key: 'supplier', label: '供应商', children: supplierText(item) },
          { key: 'factory', label: '工厂', children: factoryNode(item) },
          { key: 'source', label: '来源', children: workItemSourceLabel(item.source) },
          { key: 'line', label: '关联订单行', children: lineNode(item) },
        ]}
      />
      <EventHistory detail={props.detail} />
    </>
  );
}

function EventHistory(props: { readonly detail: WorkItemDetail }): ReactNode {
  return <WorkItemEventHistory events={props.detail.events} />;
}

function factoryNode(item: WorkItemDetail['item']): ReactNode {
  if (item.factoryName !== null) return <span><TaskTagView tag={{ key: 'factory', label: item.factoryName, tone: 'neutral', fill: 'solid' }} /></span>;
  return <span>— <Link to="/master">去主数据关联工厂</Link></span>;
}

function lineNode(item: WorkItemDetail['item']): ReactNode {
  if (item.orderLine === null) return '—';
  return (
    <Flex justify="space-between" gap={space[2]} wrap>
      <span>{item.orderLine.poRaw ?? '—'} · {item.orderLine.nameRaw ?? '—'}</span>
      <Link to={`/lines/${item.orderLine.id}`}>打开订单行</Link>
    </Flex>
  );
}

function footerOf(input: { readonly status: WorkItemStatus | null; readonly change: TaskStatusChange; readonly onClose: () => void }): ReactNode {
  return (
    <TaskActionBar
      status={input.status}
      isSaving={input.change.flow.kind === 'submitting'}
      isLocked={isStatusLocked(input.change.flow)}
      onClose={input.onClose}
      onChange={input.change.request}
    />
  );
}

function drawerTitle(load: DetailLoad): ReactNode {
  if (load.kind !== 'ready') return '更新任务';
  const item = load.detail.item;
  return (
    <span>
      更新任务
      <span style={{ marginLeft: space[1], color: statusColor.neutral.text, fontSize: fontSize.meta }}>
        {item.title} · {item.orderLine?.poRaw ?? '—'}
      </span>
    </span>
  );
}
