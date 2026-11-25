import type { ReactNode } from 'react';
import { Alert, Button, Drawer, Flex, Typography } from 'antd';
import { CalendarOutlined, FormOutlined, InboxOutlined, SendOutlined } from '@ant-design/icons';
import type { BatchFulfillment } from '@sw/domain';
import { businessToday } from '../../features/follow-up/index.js';
import { useCanWrite } from '../../shared/actor.js';
import { formatDateTime } from '../../shared/ui/format.js';
import { drawerWidth } from '../../theme/tokens.js';
import type { BoardRow, QuickAction, RowFace } from '../../features/today/index.js';
import { ActionForm, formErrors, type OpenForm } from './TodayForms.js';
import { BatchProgress, progressOf } from './batch-progress.js';
import { faceStackStyle, metaStyle, overdueStyle, reasonStyle } from './today-style.js';

type TodayDrawerProps = {
  readonly row: BoardRow | null;
  readonly batchSeq?: number | undefined;
  readonly fulfillment?: BatchFulfillment | undefined;
  readonly isOpen: boolean;
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
      keyboard={false}
      focusable={{ trap: true, focusTriggerAfterClose: true }}
      title={drawerTitle(props.row)}
      footer={props.draft === null || !canRecord ? null : <RecordFooter draft={props.draft} hadDate={props.hadDate} isSaving={props.isSaving} onSubmit={props.onSubmit} />}
    >
      {props.saveError === '' ? null : <Alert style={{ marginBottom: 16 }} type="error" showIcon title={props.saveError} />}
      <DrawerBatch {...props} canRecord={canRecord} />
      {props.draft === null || !canRecord ? null : <ActionForm draft={props.draft} hadDate={props.hadDate} lane={props.lane} onChange={props.onDraft} onSubmit={props.onSubmit} />}
    </Drawer>
  );
}

function DrawerBatch({ row, batchSeq, draft, fulfillment, isOpen, canRecord, onQuick }: TodayDrawerProps & { readonly canRecord: boolean }) {
  if (row === null) return null;
  const progress = isOpen && draft === null ? progressOf(fulfillment) : null;
  const actions = draft === null && canRecord ? row.actions : [];
  return <>
    <FaceBlock face={row.face} batchSeq={batchSeq} showsQuantities={progress === null} />
    {progress === null ? null : <BatchProgress {...progress} />}
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

export function FaceBlock(props: { readonly face: RowFace; readonly batchSeq?: number | undefined; readonly showsQuantities?: boolean }) {
  return (
    <div style={faceStackStyle()}>
      <Typography.Text strong>{props.face.orderNo}{props.batchSeq === undefined ? '' : ` · 第 ${props.batchSeq} 批`} · {props.face.productName}</Typography.Text>
      <Flex wrap align="center" gap="small">
        <Typography.Text style={reasonStyle()}>{props.face.reason}</Typography.Text>
        {props.face.overdueTone === 'quiet' ? null : <span style={overdueStyle(props.face.overdueTone)}>{props.face.overdue}</span>}
      </Flex>
      <Typography.Text type="secondary">{props.face.date}{props.face.waiting === undefined ? '' : ` · 等待方 · ${props.face.waiting}`}</Typography.Text>
      {props.showsQuantities === false ? null : <Flex wrap gap="small">
        {props.face.remaining === undefined ? null : <Typography.Text>{props.face.remaining}</Typography.Text>}
        {props.face.inTransit === undefined ? null : <Typography.Text>{props.face.inTransit}</Typography.Text>}
      </Flex>}
      {props.face.nextFollowUpAt === undefined ? null : <div style={metaStyle()}>下次跟进 · {formatDateTime(props.face.nextFollowUpAt)}</div>}
      {props.face.latestFollowUp === undefined ? null : <div style={metaStyle()}>最近跟进 · {props.face.latestFollowUp}</div>}
      {props.face.latestPromise === undefined ? null : <div style={metaStyle()}>最近承诺 · {props.face.latestPromise}</div>}
    </div>
  );
}

export function actionIcon(kind: QuickAction['kind']): ReactNode {
  if (kind === 'receipt') return <InboxOutlined />;
  if (kind === 'ship') return <SendOutlined />;
  if (kind === 'date') return <CalendarOutlined />;
  return <FormOutlined />;
}

function drawerTitle(row: BoardRow | null): string {
  if (row === null) return '今日事项';
  if (row.face.productName !== '—') return row.face.productName;
  if (row.face.reason !== '') return row.face.reason;
  return '今日事项';
}
