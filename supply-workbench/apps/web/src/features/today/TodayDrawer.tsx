import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EXCEPTION_TYPE_LABELS, EXCEPTION_TYPES } from '@sw/domain';
import { Alert, Button, Drawer, Flex, Typography } from 'antd';
import { CalendarOutlined, FormOutlined, InboxOutlined, SendOutlined } from '@ant-design/icons';
import type { TodoItemView } from '@sw/contracts';
import type { BatchFulfillment } from '@sw/domain';
import { useCanWrite } from '../../shared/actor.js';
import { formatDateTime } from '../../shared/ui/format.js';
import { drawerWidth, space } from '../../theme/tokens.js';
import { TodayOrderLink, type TodayOrderRef } from './TodayOrderLink.js';
import type { BoardRow, QuickAction, RowFace } from './model/types.js';
import { ActionForm, type OpenForm } from './TodayForms.js';
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
  const formId = useId();
  const draft = canRecord ? props.draft : null;
  return (
    <Drawer
      placement="right"
      size={drawerWidth}
      open={props.isOpen}
      onClose={props.onClose}
      keyboard={props.keyboard ?? false}
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      title={drawerTitle(props.row, draft)}
      extra={props.detail?.kind === 'order' ? <TodayOrderLink order={props.detail.order}>打开订单详情</TodayOrderLink> : null}
      footer={draft === null ? null : <RecordFooter formId={formId} isSaving={props.isSaving} onCancel={props.onClose} />}
    >
      {props.saveError === '' ? null : <Alert style={{ marginBottom: 16 }} type="error" showIcon title={props.saveError} />}
      <DrawerContent {...props} canRecord={canRecord} />
      {draft === null ? null : <ActionForm key={draft.kind} id={formId} draft={draft} hadDate={props.hadDate} lane={props.lane} onChange={props.onDraft} onSubmit={props.onSubmit} />}
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
    <FaceBlock face={row.face} batchSeq={batchSeq} shouldShowProduct={draft !== null} shouldShowQuantities={!shouldShowProgress || fulfillment === undefined} />
    {shouldShowProgress ? <BatchProgress facts={fulfillment} /> : null}
    {actions.length === 0 ? null : <Flex wrap gap="small" className="today-touch" style={{ marginBlock: 12 }}>
      {actions.map((action, index) => <Button key={action.kind} type={index === 0 ? 'primary' : 'default'}
        icon={actionIcon(action.kind)} onClick={() => onQuick(action.kind)}>{action.label}</Button>)}
    </Flex>}
  </>;
}

export function RecordFooter(props: {
  readonly formId: string;
  readonly isSaving: boolean;
  readonly onCancel: () => void;
}) {
  const canRecord = useCanWrite('records.write');
  if (!canRecord) return null;
  return (
    <Flex className="record-form-footer" justify="flex-end" gap="small">
      <Button onClick={props.onCancel}>取消</Button>
      <Button type="primary" htmlType="submit" form={props.formId} loading={props.isSaving} disabled={props.isSaving}>确认</Button>
    </Flex>
  );
}

type FaceBlockProps = {
  readonly face: RowFace;
  readonly batchSeq: number | undefined;
  readonly shouldShowProduct: boolean;
  readonly shouldShowQuantities: boolean;
};

function FaceBlock(props: FaceBlockProps) {
  const { face, shouldShowProduct, shouldShowQuantities } = props;
  const identity = faceIdentity(props);
  return (
    <Flex vertical gap={space[0]} style={{ marginBottom: shouldShowProduct ? space[3] : undefined }}>
      {identity === '' ? null : <Typography.Text strong>{identity}</Typography.Text>}
      <Flex wrap align="center" gap="small">
        <Typography.Text style={reasonStyle()}>{face.reason}</Typography.Text>
        {face.overdueTone === 'quiet' ? null : <span style={overdueStyle(face.overdueTone)}>{face.overdue}</span>}
      </Flex>
      <FaceMeta face={face} />
      {shouldShowQuantities === false ? null : <Flex wrap gap="small">
        {face.remaining === undefined ? null : <Typography.Text>{face.remaining}</Typography.Text>}
        {face.inTransit === undefined ? null : <Typography.Text>{face.inTransit}</Typography.Text>}
      </Flex>}
      {face.nextFollowUpAt === undefined ? null : <div style={metaStyle()}>下次跟进 · {formatDateTime(face.nextFollowUpAt)}</div>}
      <FollowUpFacts face={face} />
    </Flex>
  );
}

function faceIdentity({ face, batchSeq, shouldShowProduct }: FaceBlockProps): string {
  return [face.orderNo, batchSeq === undefined ? '' : `第 ${batchSeq} 批`, shouldShowProduct ? face.productName : '']
    .filter((part) => part !== '' && part !== '—').join(' · ');
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

const draftTitle: Record<OpenForm['kind'], string> = {
  receipt: '登记收货', ship: '登记发货', date: '改确认日', note: '记跟进', exception: '标异常',
};

function drawerTitle(row: BoardRow | null, draft: OpenForm | null): string {
  if (draft !== null) return draftTitle[draft.kind];
  if (row === null) return '今日事项';
  if (row.face.productName !== '—') return row.face.productName;
  if (row.face.reason !== '') return row.face.reason;
  return '今日事项';
}
