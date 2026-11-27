import { Alert, Button, Descriptions, Drawer, Flex, Result, Skeleton } from 'antd';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { WorkItemPredecessor } from '@sw/contracts';
import { failureText, readFailureOf } from '../../shared/api/reads.js';
import { useCanWrite } from '../../shared/actor.js';
import {
  ownerText,
  plannedRangeText,
  supplierText,
  TodayOrderLink, taskParam,
  workItemSourceLabel,
  type TodayOrderRef,
  type WorkItemDetail,
  type WorkItemStatus,
} from '../today/index.js';
import { drawerWide, fontSize, space, statusColor } from '../../theme/tokens.js';
import { loadWorkItem } from './api.js';
import { TaskDependencyWarning } from './dependency-warning.js';
import { WorkItemEventHistory } from './event-history.js';
import { isStatusLocked, statusFeedback } from './model/task-status-flow.js';
import { TaskActionBar, TaskStatusEditor } from './task-status-controls.js';
import { TaskTagView, WorkItemStatusTag } from './task-tag.js';
import { useTaskStatusChange, type TaskStatusChange } from './use-task-status-change.js';

export { TaskActionBar };

type DetailLoad =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly detail: WorkItemDetail }
  | { readonly kind: 'error'; readonly message: string };

export type TaskDrawerProps = {
  readonly workItemId: string | null;
  readonly isOpen: boolean;
  readonly showScheduleLink?: boolean;
  readonly readOnly?: { readonly returnLink: ReactNode; readonly predecessorLink?: (predecessor: WorkItemPredecessor) => ReactNode };
  readonly orderLink?: (order: TodayOrderRef) => ReactNode;
  readonly onClose: () => void;
  readonly onChanged: () => void;
};

export function TaskDrawer(props: TaskDrawerProps): ReactNode {
  const canWriteRecords = useCanWrite('records.write');
  const isReadOnly = props.readOnly !== undefined;
  const canRecord = canWriteRecords && !isReadOnly;
  const data = useTaskDetail({ workItemId: props.workItemId, isOpen: props.isOpen });
  const ready = data.load.kind === 'ready' ? data.load.detail.item : null;
  const change = useTaskStatusChange({
    status: ready === null ? null : ready.status,
    workItemId: props.workItemId,
    onReload: data.reload,
    onChanged: props.onChanged,
  });
  return (
    <Drawer
      placement="right"
      size={isReadOnly ? `min(${drawerWide}px, 100vw)` : drawerWide}
      open={props.isOpen}
      onClose={props.onClose}
      title={drawerTitle(data.load, canRecord ? '更新任务' : '任务详情')}
      extra={scheduleLink(props, ready)}
      footer={footerOf({ status: ready?.status ?? null, change, onClose: props.onClose, readOnly: props.readOnly })}
    >
      <DrawerBody load={data.load} change={change} onRetry={data.reload} canRecord={canRecord} isReadOnly={isReadOnly}
        orderLink={props.orderLink} predecessorLink={props.readOnly?.predecessorLink} />
    </Drawer>
  );
}

function scheduleLink(props: TaskDrawerProps, item: WorkItemDetail['item'] | null): ReactNode {
  if (props.showScheduleLink !== true || item === null || item.id !== props.workItemId) return null;
  const params = new URLSearchParams({ view: 'schedule', from: item.plannedEnd, drawer: taskParam(item.id) });
  return <Link to={`/progress?${params}`}>在总排期查看此任务</Link>;
}

function useTaskDetail(input: { readonly workItemId: string | null; readonly isOpen: boolean }): {
  readonly load: DetailLoad;
  readonly reload: () => void;
} {
  const [result, setResult] = useState<{ readonly id: string; readonly load: DetailLoad } | null>(null);
  const [reload, setReload] = useState(0);
  const { workItemId, isOpen } = input;
  useEffect(() => {
    if (!isOpen || workItemId === null) return;
    let isActive = true;
    setResult((current) => current?.id === workItemId && current.load.kind === 'ready'
      ? current : { id: workItemId, load: { kind: 'loading' } });
    void loadWorkItem(workItemId)
      .then((detail) => {
        if (isActive) setResult({ id: workItemId, load: { kind: 'ready', detail } });
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        const failure = readFailureOf(error);
        if (failure === null) return;
        setResult({ id: workItemId, load: { kind: 'error', message: failureText(failure) } });
      });
    return () => { isActive = false; };
  }, [workItemId, isOpen, reload]);
  return { load: result !== null && result.id === workItemId ? result.load : { kind: 'loading' }, reload: () => setReload((value) => value + 1) };
}

type TaskDetailOptions = {
  readonly canRecord: boolean;
  readonly isReadOnly: boolean;
  readonly orderLink: TaskDrawerProps['orderLink'];
  readonly predecessorLink: NonNullable<TaskDrawerProps['readOnly']>['predecessorLink'];
};

function DrawerBody(props: TaskDetailOptions & { readonly load: DetailLoad; readonly change: TaskStatusChange; readonly onRetry: () => void }): ReactNode {
  if (props.load.kind === 'loading') return <Skeleton active paragraph={{ rows: 6 }} />;
  if (props.load.kind === 'error') return <Result status="error" title="任务没有读出来" subTitle={props.load.message} extra={<Button type="primary" onClick={props.onRetry}>重试</Button>} />;
  return <TaskDetail {...props} detail={props.load.detail} />;
}

function TaskDetail({ detail, change, canRecord, isReadOnly, orderLink, predecessorLink }: TaskDetailOptions & { readonly detail: WorkItemDetail; readonly change: TaskStatusChange }): ReactNode {
  const canReview = useCanWrite('master.review');
  const item = detail.item;
  const feedback = statusFeedback(change.flow);
  return (
    <>
      {canRecord ? <Alert style={{ marginBottom: space[3] }} type="info" showIcon title="来源排期任务。改状态后写入事件历史，今日列表和进度总排期同时刷新。" /> : null}
      <TaskDependencyWarning detail={detail} predecessorLink={predecessorLink} />
      {feedback === null ? null : <Alert style={{ marginBottom: space[3] }} type={feedback.tone} showIcon title={feedback.text} />}
      {canRecord ? (
        <TaskStatusEditor
          status={item.status}
          flow={change.flow}
          onRequest={change.request}
          onCancel={change.cancel}
          onCommit={change.commit}
        />
      ) : null}
      <Descriptions
        size="small"
        column={1}
        style={{ marginTop: space[3] }}
        items={[
          ...(isReadOnly ? [{ key: 'status', label: '状态', children: <WorkItemStatusTag status={item.status} /> }] : []),
          { key: 'when', label: '计划起止', children: plannedRangeText(item, item.plannedStart) },
          { key: 'owner', label: '负责人', children: ownerText(item) },
          { key: 'supplier', label: '供应商', children: supplierText(item) },
          { key: 'factory', label: '工厂', children: factoryNode(item, canReview) },
          { key: 'source', label: '来源', children: workItemSourceLabel(item.source) },
          { key: 'line', label: '关联订单行', children: lineNode(item, orderLink) },
        ]}
      />
      <EventHistory detail={detail} />
    </>
  );
}

function EventHistory(props: { readonly detail: WorkItemDetail }): ReactNode {
  return <WorkItemEventHistory events={props.detail.events} />;
}

function factoryNode(item: WorkItemDetail['item'], canReview: boolean): ReactNode {
  if (item.factoryName !== null) return <span><TaskTagView tag={{ key: 'factory', label: item.factoryName, tone: 'neutral', fill: 'solid' }} /></span>;
  if (!canReview) return '—';
  return <span>— <Link to="/master">去主数据关联工厂</Link></span>;
}

function lineNode(item: WorkItemDetail['item'], orderLink: TaskDrawerProps['orderLink']): ReactNode {
  if (item.orderLine === null) return '—';
  const order = { lineId: item.orderLine.id, ...(item.batch === null ? {} : { batchId: item.batch.id }) };
  return (
    <Flex justify="space-between" gap={space[2]} wrap>
      <span>{item.orderLine.poRaw ?? '—'} · {item.orderLine.nameRaw ?? '—'}</span>
      {orderLink === undefined ? <TodayOrderLink order={order}>打开订单行</TodayOrderLink> : orderLink(order)}
    </Flex>
  );
}

function footerOf(input: {
  readonly status: WorkItemStatus | null; readonly change: TaskStatusChange; readonly onClose: () => void;
  readonly readOnly: TaskDrawerProps['readOnly'];
}): ReactNode {
  if (input.readOnly !== undefined) return <Flex align="center" justify="flex-end" wrap gap={space[2]}>
    {input.readOnly.returnLink}<Button onClick={input.onClose}>关闭</Button>
  </Flex>;
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

function drawerTitle(load: DetailLoad, title: string): ReactNode {
  if (load.kind !== 'ready') return title;
  const item = load.detail.item;
  return (
    <span>
      {title}
      <span style={{ marginLeft: space[1], color: statusColor.neutral.text, fontSize: fontSize.meta }}>
        {item.title} · {item.orderLine?.poRaw ?? '—'}
      </span>
    </span>
  );
}
