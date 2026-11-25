import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { EXCEPTION_TYPE_LABELS, EXCEPTION_TYPES } from '@sw/domain';
import { Alert, Button, Drawer, Flex, Typography } from 'antd';
import { CalendarOutlined, FormOutlined, InboxOutlined, SendOutlined } from '@ant-design/icons';
import type { TodoItemView } from '@sw/contracts';
import type { BatchFulfillment } from '@sw/domain';
import { businessToday } from '../../features/follow-up/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { formatDateTime } from '../../shared/ui/format.js';
import { drawerWidth, space } from '../../theme/tokens.js';
import { TodayOrderLink, type TodayOrderRef } from './TodayOrderLink.js';
import type { BoardRow, QuickAction, RowFace } from './model/types.js';
import { ActionForm, formErrors, type OpenForm } from './TodayForms.js';
import { BatchProgress } from './batch-progress.js';
import { metaStyle, overdueStyle, reasonStyle } from './today-style.js';

export type ActionDetail =
  | { readonly kind: 'order'; readonly order: TodayOrderRef; readonly exception: TodoItemView['exception'] }
  | { readonly kind: 'review' }
  | { readonly kind: 'import'; readonly batchId: string };

type TodayDrawerProps = {
  readonly row: BoardRow | null;
  readonly detail?: ActionDetail | undefined;
  readonly batchSeq?: number | undefined;
  readonly fulfillment?: BatchFulfillment | undefined;
  readonly isOpen: boolean;
  readonly keyboard?: boolean;
  readonly draft: OpenForm | null;
  readonly hadDate: boolean;
  readonly lane: 'finished' | 'material';
  readonly isSaving: boolean;
  readonly saveError: string;
  readonly onClose: () => void;
  readonly onDraft: (draft: OpenForm) => void;
  readonly onQuick: (kind: QuickAction['kind']) => void;
  readonly onSubmit: () => void;
};

export function TodayDrawer(props: TodayDrawerProps) {
  const canRecord = useCanWrite('records.write');
  return (
    <Drawer
      placement="right"
      size={drawerWidth}
      open={props.isOpen}
      onClose={props.onClose}
      keyboard={props.keyboard ?? false}
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      title={drawerTitle(props.row)}
      extra={props.detail?.kind === 'order' ? <TodayOrderLink order={props.detail.order}>打开订单详情</TodayOrderLink> : null}
      footer={props.draft === null || !canRecord ? null : <RecordFooter draft={props.draft} hadDate={props.hadDate} isSaving={props.isSaving} onSubmit={props.onSubmit} />}
    >
      {props.saveError === '' ? null : <Alert style={{ marginBottom: 16 }} type="error" showIcon title={props.saveError} />}
      <DrawerContent {...props} canRecord={canRecord} />
      {props.draft === null || !canRecord ? null : <ActionForm draft={props.draft} hadDate={props.hadDate} lane={props.lane} onChange={props.onDraft} onSubmit={props.onSubmit} />}
    </Drawer>
  );
}

function DrawerContent(props: TodayDrawerProps & { readonly canRecord: boolean }) {
  const detail = props.detail;
  if (detail?.kind === 'review') return <Flex gap="middle" wrap>
    <Link to="/master">查看别名审核</Link>
    <Link to="/master?tab=multi">查看一号多名</Link>
    <Link to="/master?tab=factory-link">查看工厂待处理</Link>
  </Flex>;
  if (detail?.kind === 'import') return <Link to={'/imports/' + encodeURIComponent(detail.batchId)}>打开导入批次</Link>;
  return <>
    {detail?.kind === 'order' && detail.exception !== null ? <ExceptionNote exception={detail.exception} /> : null}
    <DrawerBatch {...props} />
  </>;
}

function ExceptionNote({ exception }: { readonly exception: NonNullable<Extract<ActionDetail, { kind: 'order' }>['exception']> }) {
  const type = EXCEPTION_TYPES.find((key) => key === exception.type);
  return <Alert type="warning" showIcon title={type === undefined ? '已登记异常' : EXCEPTION_TYPE_LABELS[type]} description={exception.note} />;
}

function DrawerBatch({ row, batchSeq, draft, fulfillment, isOpen, canRecord, onQuick }: TodayDrawerProps & { readonly canRecord: boolean }) {
  if (row === null) return null;
  const shouldShowProgress = isOpen && draft === null && batchSeq !== undefined;
  const actions = draft === null && canRecord ? row.actions : [];
  return <>
    <FaceBlock face={row.face} batchSeq={batchSeq} showsQuantities={!shouldShowProgress || fulfillment === undefined} />
    {shouldShowProgress ? <BatchProgress facts={fulfillment} /> : null}
    {actions.length === 0 ? null : <Flex wrap gap="small" className="today-touch" style={{ marginBlock: 12 }}>
      {actions.map((action, index) => <Button key={action.kind} type={index === 0 ? 'primary' : 'default'}
        icon={actionIcon(action.kind)} onClick={() => onQuick(action.kind)}>{action.label}</Button>)}
    </Flex>}
  </>;
}

export function RecordFooter(props: {
  readonly draft: OpenForm | null;
  readonly hadDate: boolean;
  readonly isSaving: boolean;
  readonly onSubmit: () => void;
}) {
  const canRecord = useCanWrite('records.write');
  if (!canRecord) return null;
  const isBlocked = props.draft !== null && formErrors({ draft: props.draft, hadDate: props.hadDate, today: businessToday() }).length > 0;
  return (
    <Flex justify="flex-end">
      <Button type="primary" loading={props.isSaving} disabled={props.isSaving || isBlocked} onClick={props.onSubmit}>确认</Button>
    </Flex>
  );
}

function FaceBlock(props: { readonly face: RowFace; readonly batchSeq?: number | undefined; readonly showsQuantities?: boolean }) {
  return (
    <Flex vertical gap={space[0]}>
      <Typography.Text strong>{props.face.orderNo === '—' ? null : props.face.orderNo + ' · '}{props.batchSeq === undefined ? '' : `第 ${props.batchSeq} 批 · `}{props.face.productName}</Typography.Text>
      <Flex wrap align="center" gap="small">
        <Typography.Text style={reasonStyle()}>{props.face.reason}</Typography.Text>
        {props.face.overdueTone === 'quiet' ? null : <span style={overdueStyle(props.face.overdueTone)}>{props.face.overdue}</span>}
      </Flex>
      <FaceMeta face={props.face} />
      {props.showsQuantities === false ? null : <Flex wrap gap="small">
        {props.face.remaining === undefined ? null : <Typography.Text>{props.face.remaining}</Typography.Text>}
        {props.face.inTransit === undefined ? null : <Typography.Text>{props.face.inTransit}</Typography.Text>}
      </Flex>}
      {props.face.nextFollowUpAt === undefined ? null : <div style={metaStyle()}>下次跟进 · {formatDateTime(props.face.nextFollowUpAt)}</div>}
      <FollowUpFacts face={props.face} />
    </Flex>
  );
}

function FollowUpFacts({ face }: { readonly face: RowFace }) {
  return <>
    {face.latestFollowUp === undefined ? null : <div style={metaStyle()}>最近跟进 · {face.latestFollowUp}</div>}
    {face.latestPromise === undefined ? null : <div style={metaStyle()}>最近承诺 · {face.latestPromise}</div>}
  </>;
}

function FaceMeta({ face }: { readonly face: RowFace }) {
  const date = face.date === '—' ? [] : [face.date];
  const waiting = face.waiting === undefined ? [] : ['等待方 · ' + face.waiting];
  const parts = [...date, ...waiting, ...(face.isUnassigned === true ? ['未分配'] : [])];
  return parts.length === 0 ? null : <Typography.Text type="secondary">{parts.join(' · ')}</Typography.Text>;
}

export function actionIcon(kind: QuickAction['kind']): ReactNode {
  if (kind === 'receipt') return <InboxOutlined aria-hidden />;
  if (kind === 'ship') return <SendOutlined aria-hidden />;
  if (kind === 'date') return <CalendarOutlined aria-hidden />;
  return <FormOutlined aria-hidden />;
}

function drawerTitle(row: BoardRow | null): string {
  if (row === null) return '今日事项';
  if (row.face.productName !== '—') return row.face.productName;
  if (row.face.reason !== '') return row.face.reason;
  return '今日事项';
}
