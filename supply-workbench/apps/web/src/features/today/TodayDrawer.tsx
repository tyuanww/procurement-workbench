import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { EXCEPTION_TYPE_LABELS, EXCEPTION_TYPES } from '@sw/domain';
import { Alert, Button, Drawer, Flex, Typography } from 'antd';
import { CalendarOutlined, CopyOutlined, FormOutlined, InboxOutlined, SendOutlined } from '@ant-design/icons';
import type { TodoItemView } from '@sw/contracts';
import type { BatchFulfillment } from '@sw/domain';
import { useCanWrite } from '../../shared/actor.js';
import { formatDateTime, formatQuantity } from '../../shared/ui/format.js';
import { StatusTag } from '../../shared/ui/widgets.js';
import { drawerWidth, space } from '../../theme/tokens.js';
import { arrivalStatusLabel } from './ArrivalMemos.js';
import { TodayBatchRecordLink, TodayOrderLink, type ReceiptWork, type TodayOrderRef } from './TodayOrderLink.js';
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
  readonly receipt?: ReceiptWork | undefined;
  readonly copy?: { readonly label: string; readonly disabled: boolean; readonly run: () => void } | null;
  readonly returnFocusId?: string | undefined;
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
  const { isShown, afterOpenChange } = useTodayDrawerFocus(props);
  const draft = canRecord ? props.draft : null;
  const order = drawerOrder(props);
  return (
    <Drawer
      rootClassName="today-action-drawer"
      placement="right"
      size={`min(${drawerWidth}px, 100vw)`}
      open={props.isOpen}
      onClose={props.onClose}
      keyboard={props.keyboard ?? false}
      afterOpenChange={afterOpenChange}
      closable={{ 'aria-label': '关闭' }}
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      title={drawerTitle({ row: props.row, draft, receipt: props.receipt })}
      extra={<OrderOnlyLink order={order} />}
      footer={draft === null ? null : <RecordFooter formId={formId} isSaving={props.isSaving} onCancel={props.onClose} />}
    >
      {props.saveError === '' ? null : <Alert style={{ marginBlockEnd: space[3] }} type="error" showIcon title={props.saveError} />}
      <DrawerContent {...props} draft={draft} canRecord={canRecord} />
      <BatchRecord order={order} isOpen={props.isOpen && draft === null} isShown={isShown} />
      {draft === null ? null : <ActionForm key={draft.kind} id={formId} draft={draft} hadDate={props.hadDate} lane={props.lane} onChange={props.onDraft} onSubmit={props.onSubmit} />}
      <style>{drawerTouchCss}</style>
    </Drawer>
  );
}

function drawerOrder({ receipt, detail }: Pick<TodayDrawerProps, 'receipt' | 'detail'>) {
  if (receipt !== undefined) return { lineId: receipt.line.id, batchId: receipt.batchId };
  return detail?.kind === 'order' ? detail.order : undefined;
}

function BatchRecord({ order, isOpen, isShown }: {
  readonly order: TodayOrderRef | undefined; readonly isOpen: boolean; readonly isShown: boolean;
}) {
  if (!isOpen || order?.batchId === undefined) return null;
  return <div className="today-batch-record"><TodayBatchRecordLink lineId={order.lineId} batchId={order.batchId} isShown={isShown} /></div>;
}

function OrderOnlyLink({ order }: { readonly order: TodayOrderRef | undefined }) {
  return order !== undefined && order.batchId === undefined ? <TodayOrderLink order={order}>打开订单详情</TodayOrderLink> : null;
}

function useTodayDrawerFocus({ isOpen, returnFocusId }: Pick<TodayDrawerProps, 'isOpen' | 'returnFocusId'>) {
  const [isShown, setShown] = useState(false);
  const returnFocus = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    if (isOpen) returnFocus.current = returnFocusId;
  }, [isOpen, returnFocusId]);
  return {
    isShown,
    afterOpenChange(isOpen: boolean) {
      setShown(isOpen);
      if (!isOpen && returnFocus.current !== undefined) restoreSourceFocus(returnFocus.current);
    },
  };
}

function restoreSourceFocus(id: string) {
  window.requestAnimationFrame(() => {
    const focused = document.activeElement;
    if (focused === document.body || focused?.closest('.today-action-drawer') != null) document.getElementById(id)?.focus();
  });
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

function DrawerBatch({ row, batchSeq, draft, fulfillment, receipt, copy, isOpen, canRecord, onQuick }: TodayDrawerProps & { readonly canRecord: boolean }) {
  if (row === null) return receipt === undefined ? null : <ArrivalContext memo={receipt} />;
  if (draft !== null) return <EditContext face={row.face} batchSeq={batchSeq} draftKind={draft.kind} />;
  const shouldShowProgress = isOpen && batchSeq !== undefined;
  return <>
    <DetailContext face={row.face} batchSeq={batchSeq} receipt={receipt} shouldShowQuantities={!shouldShowProgress || fulfillment === undefined} />
    {shouldShowProgress ? <BatchProgress facts={fulfillment} /> : null}
    <DrawerActions receipt={receipt} actions={canRecord ? row.actions : []} copy={copy ?? null} onQuick={onQuick} />
  </>;
}

function DrawerActions({ actions, receipt, copy, onQuick }: Pick<TodayDrawerProps, 'receipt' | 'copy' | 'onQuick'> & {
  readonly actions: readonly QuickAction[];
}) {
  if (copy == null && actions.length === 0) return null;
  const work = receipt === undefined ? actions : [...actions.filter(({ kind }) => kind === 'receipt'), ...actions.filter(({ kind }) => kind !== 'receipt')];
  return <Flex wrap gap="small" className="today-touch" style={{ marginBlock: 12 }}>
    {work.map((action, index) => <Button key={action.kind}
      type={receipt === undefined ? (index === 0 ? 'primary' : 'default') : (action.kind === 'receipt' ? 'primary' : 'text')}
      icon={actionIcon(action.kind)} onClick={() => onQuick(action.kind)}>{action.label}</Button>)}
    {copy == null ? null : <Button icon={<CopyOutlined aria-hidden />} onClick={copy.run} disabled={copy.disabled}>{copy.label}</Button>}
  </Flex>;
}

function ArrivalContext({ memo }: { readonly memo: ReceiptWork }) {
  const identity = [memo.line.poRaw, memo.batchSeq == null ? null : `第 ${memo.batchSeq} 批`].filter(Boolean).join(' · ');
  return <Flex vertical gap={space[1]} style={{ overflowWrap: 'anywhere' }}>
    {identity === '' ? null : <Typography.Text type="secondary">{identity}</Typography.Text>}
    <Typography.Text strong>{arrivalStatusLabel[memo.status]}</Typography.Text>
    <Typography.Text>收货方 · {memo.warehouse ?? '未命名'}</Typography.Text>
    <Typography.Text>采购确认到仓日 · {memo.confirmedDate ?? '未确认'}</Typography.Text>
    <Typography.Text>待收 {formatQuantity(memo.inTransitQty)} {memo.unit} · 实收 {formatQuantity(memo.receivedQty)} {memo.unit}</Typography.Text>
  </Flex>;
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

function DetailContext({ face, batchSeq, receipt, shouldShowQuantities }: BatchIdentity & {
  readonly receipt: ReceiptWork | undefined;
  readonly shouldShowQuantities: boolean;
}) {
  return (
    <Flex vertical gap={space[0]}>
      <OrderIdentity face={face} batchSeq={batchSeq} />
      <Flex wrap align="center" gap="small">
        <Typography.Text style={reasonStyle()}>{face.reason}</Typography.Text>
        {face.overdueTone === 'quiet' ? null : <span style={overdueStyle(face.overdueTone)}>{face.overdue}</span>}
      </Flex>
      <FaceMeta face={face} receipt={receipt} />
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

function FaceMeta({ face, receipt }: { readonly face: RowFace; readonly receipt?: ReceiptWork | undefined }) {
  const facts = receipt === undefined ? (face.date === '—' ? [] : [face.date]) : receiptFacts(face, receipt);
  const waiting = waitingFact(face, receipt);
  const parts = [...facts, ...waiting, ...(face.isUnassigned === true ? ['未分配'] : [])];
  return parts.length === 0 ? null : <Typography.Text type="secondary">{parts.join(' · ')}</Typography.Text>;
}

function receiptFacts(face: RowFace, receipt: ReceiptWork): string[] {
  const facts = [`采购确认到仓日 · ${receipt.confirmedDate ?? '未确认'}`, `收货方 · ${receipt.warehouse ?? '未命名'}`];
  if (face.date !== '—' && face.date !== receipt.confirmedDate) facts.push(`待办日期 · ${face.date}`);
  return facts;
}

function waitingFact(face: RowFace, receipt: ReceiptWork | undefined): string[] {
  if (face.waiting === undefined || (receipt !== undefined && face.waitingKind === 'receiver')) return [];
  const label = receipt !== undefined && face.waitingKind === 'supplier' ? '催货对象' : '等待方';
  return [`${label} · ${face.waiting}`];
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

function drawerTitle({ row, draft, receipt }: Pick<TodayDrawerProps, 'row' | 'draft' | 'receipt'>): string {
  if (draft !== null) return draftTitle[draft.kind];
  if (row === null) return receipt?.line.nameRaw || '今日事项';
  if (row.face.productName !== '—') return row.face.productName;
  if (row.face.reason !== '') return row.face.reason;
  return '今日事项';
}

const drawerTouchCss = `
  .today-action-drawer .today-batch-record > a { display: inline-flex; align-items: center; padding-block: 4px; }
  @media (max-width: 575px), (any-pointer: coarse) {
    .today-action-drawer .ant-drawer-header { padding-block: ${space[0]}px; }
    .today-action-drawer .ant-drawer-close,
    .today-action-drawer .today-batch-record > a,
    .today-action-drawer .ant-drawer-extra > a { min-inline-size: 44px; min-block-size: 44px; }
    .today-action-drawer .ant-drawer-extra > a { display: inline-flex; align-items: center; }
  }
`;
