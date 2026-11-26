import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EXCEPTION_TYPE_LABELS, EXCEPTION_TYPES } from '@sw/domain';
import { Alert, Button, Drawer, Flex, Typography } from 'antd';
import { CalendarOutlined, FormOutlined, InboxOutlined, SendOutlined } from '@ant-design/icons';
import type { TodoItemView } from '@sw/contracts';
import type { BatchFulfillment } from '@sw/domain';
import { useCanWrite } from '../../shared/actor.js';
import { formatDateTime } from '../../shared/ui/format.js';
import { StatusTag } from '../../shared/ui/widgets.js';
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
      rootClassName="today-action-drawer"
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
      {props.saveError === '' ? null : <Alert style={{ marginBlockEnd: space[3] }} type="error" showIcon title={props.saveError} />}
      <DrawerContent {...props} draft={draft} canRecord={canRecord} />
      {draft === null ? null : <ActionForm key={draft.kind} id={formId} draft={draft} hadDate={props.hadDate} lane={props.lane} onChange={props.onDraft} onSubmit={props.onSubmit} />}
      <style>{drawerTouchCss}</style>
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
    {draft === null
      ? <DetailContext face={row.face} batchSeq={batchSeq} shouldShowQuantities={!shouldShowProgress || fulfillment === undefined} />
      : <EditContext face={row.face} batchSeq={batchSeq} draftKind={draft.kind} />}
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
      <Button type="primary" htmlType="submit" aria-label="确认" aria-busy={props.isSaving} form={props.formId} loading={props.isSaving} disabled={props.isSaving}>确认</Button>
    </Flex>
  );
}

type BatchIdentity = {
  readonly face: RowFace;
  readonly batchSeq: number | undefined;
};

function EditContext({ face, batchSeq, draftKind }: BatchIdentity & { readonly draftKind: OpenForm['kind'] }) {
  const reason = face.reason.split('、', 1)[0];
  const followContext = face.nextFollowUpTarget ?? face.waiting;
  return (
    <Flex vertical gap={space[0]} style={{ marginBlockEnd: space[3] }}>
      {face.productName === '—' ? null : <Typography.Text strong style={{ overflowWrap: 'anywhere' }}>{face.productName}</Typography.Text>}
      <OrderIdentity face={face} batchSeq={batchSeq} />
      <div>
        {face.overdueTone === 'danger' ? <StatusTag status="overdue" label={face.overdue} /> : <Typography.Text type="secondary">{reason}</Typography.Text>}
      </div>
      {draftKind === 'note' ? followContext === undefined ? null : <Typography.Text type="secondary">
        {face.nextFollowUpTarget === undefined ? '当前等待方' : '跟进对象'} · <Typography.Text strong>{followContext}</Typography.Text>
      </Typography.Text> : <><FaceMeta face={face} /><FaceQuantities face={face} /></>}
    </Flex>
  );
}

function DetailContext({ face, batchSeq, shouldShowQuantities }: BatchIdentity & { readonly shouldShowQuantities: boolean }) {
  return (
    <Flex vertical gap={space[0]}>
      <OrderIdentity face={face} batchSeq={batchSeq} />
      <Flex wrap align="center" gap="small">
        <Typography.Text style={reasonStyle()}>{face.reason}</Typography.Text>
        {face.overdueTone === 'quiet' ? null : <span style={overdueStyle(face.overdueTone)}>{face.overdue}</span>}
      </Flex>
      <FaceMeta face={face} />
      {shouldShowQuantities ? <FaceQuantities face={face} /> : null}
      {face.nextFollowUpAt === undefined ? null : <div style={metaStyle()}>
        下次跟进 · {formatDateTime(face.nextFollowUpAt)}{face.nextFollowUpTarget === undefined ? '' : ` · ${face.nextFollowUpTarget}`}
      </div>}
      <FollowUpFacts face={face} />
    </Flex>
  );
}

function OrderIdentity({ face, batchSeq }: BatchIdentity) {
  const identity = [face.orderNo === '—' ? '' : face.orderNo, batchSeq === undefined ? '' : `第 ${batchSeq} 批`].filter(Boolean).join(' · ');
  return identity === '' ? null : <Typography.Text type="secondary" style={{ overflowWrap: 'anywhere' }}>{identity}</Typography.Text>;
}

function FaceQuantities({ face }: { readonly face: RowFace }) {
  if (face.remaining === undefined && face.inTransit === undefined) return null;
  return <Flex wrap gap="small">
    {face.remaining === undefined ? null : <Typography.Text>{face.remaining}</Typography.Text>}
    {face.inTransit === undefined ? null : <Typography.Text>{face.inTransit}</Typography.Text>}
  </Flex>;
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

const drawerTouchCss = `
  @media (max-width: 575px), (any-pointer: coarse) {
    .today-action-drawer .ant-drawer-header { padding-block: ${space[0]}px; }
    .today-action-drawer .ant-drawer-close,
    .today-action-drawer .ant-drawer-extra > a { min-inline-size: 44px; min-block-size: 44px; }
    .today-action-drawer .ant-drawer-extra > a { display: inline-flex; align-items: center; }
  }
`;
